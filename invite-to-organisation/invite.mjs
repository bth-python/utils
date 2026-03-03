import 'dotenv/config'
import { Octokit } from "octokit";
import fs from 'fs/promises';

const octokit = new Octokit({
    auth: process.env["GITHUB_TOKEN"]
});

// ---------------------------------------------------------------------------
// Canvas API
// ---------------------------------------------------------------------------

async function updateCanvas(courseId, assignmentId, userId, attempt, status, comment) {
    const urlencoded = new URLSearchParams();
    if ([201, 422].includes(status)) {
        urlencoded.append("submission[posted_grade]", "G");
        urlencoded.append("comment[text_comment]", comment);
    } else {
        urlencoded.append("submission[posted_grade]", "Ux");
        urlencoded.append("comment[text_comment]", comment + "\n\nKontakta kursansvarig om du behöver hjälp.");
    }
    urlencoded.append("comment[attempt]", attempt);

    console.log(`[Canvas] Updating user ${userId} — status ${status}: ${comment}`);

    return fetch(
        `https://bth.instructure.com/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}`,
        {
            method: "PUT",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Authorization": `Bearer ${process.env.CANVAS_TOKEN}`,
            },
            body: urlencoded,
        }
    ).catch(error => console.error(`[updateCanvas] Failed for user ${userId}:`, error));
}

async function fetchStudentSubmissions(courseId, assignmentId) {
    let submitted = [];
    let result = [];
    let page = 1;

    do {
        submitted = submitted.concat(
            result
                .filter(item => item.workflow_state === "submitted")
                .map(item => ({
                    githubUsername: item.body.replace(/<[^>]*>/g, '').trim(),
                    email: item.user.login_id,
                    userId: item.user.id,
                    attempt: item.attempt,
                }))
        );

        const url = `https://bth.instructure.com/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions?per_page=100&page=${page}&include[]=user`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${process.env.CANVAS_TOKEN}` },
        });

        if (!response.ok) {
            console.error(`[fetchStudentSubmissions] HTTP error on page ${page} (status=${response.status}): ${response.statusText}`);
            break;
        }

        result = await response.json();
        page++;
    } while (result.length > 0);

    return submitted;
}

// ---------------------------------------------------------------------------
// GitHub API helpers
// ---------------------------------------------------------------------------

async function getGitHubUserId(username) {
    const res = await octokit.request('GET /users/{username}', {
        username,
        headers: { 'X-GitHub-Api-Version': '2022-11-28' },
    });
    return res.data.id;
}

async function inviteToOrg(organization, githubUserId) {
    return octokit.request('POST /orgs/{org}/invitations', {
        org: organization,
        invitee_id: githubUserId,
        role: 'direct_member',
        headers: { 'X-GitHub-Api-Version': '2022-11-28' },
    });
}

async function createRepo(organization, login, repoName, notify) {
    try {
        await octokit.request('POST /repos/{template_owner}/{template_repo}/generate', {
            template_owner: organization,
            template_repo: 'template',
            owner: organization,
            name: repoName,
            private: true,
            headers: { 'X-GitHub-Api-Version': '2022-11-28' },
        });
    } catch (error) {
        if (error.status === 422) {
            console.error(`[${repoName}] Repository already exists.`);
            await notify(error.status, `Repository ${repoName} already exists.`);
        } else {
            console.error(`[${repoName}] Failed to create repository (status=${error.status}):`, error.message);
            await notify(error.status, `Failed to create repository ${repoName}: ${error.message}`);
        }
        return false;
    }

    try {
        await octokit.request('PUT /repos/{owner}/{repo}/collaborators/{username}', {
            owner: organization,
            repo: repoName,
            username: login,
            permission: 'push',
            headers: { 'X-GitHub-Api-Version': '2022-11-28' },
        });
    } catch (error) {
        console.error(`[${repoName}] Failed to add ${login} as collaborator (status=${error.status}):`, error.message);
        await notify(error.status, `Failed to add ${login} as collaborator to ${repoName}: ${error.message}`);
        return false;
    }

    return true;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

async function processSubmission(submission, course) {
    const { githubUsername, email, userId, attempt } = submission;
    const { courseId, assignmentId, organization } = course;

    const notify = (status, comment) => updateCanvas(courseId, assignmentId, userId, attempt, status, comment);

    if (!githubUsername) {
        console.error(`[user=${userId}] Could not extract a GitHub username from submission.`);
        await notify(410, `Could not extract a GitHub username from submission.`);
        return;
    }

    const repoName = `algo-${email.split('@')[0]}`;
    const repoUrl = `https://github.com/${organization}/${repoName}`;
    const orgInviteUrl = `https://github.com/orgs/${organization}/invitation`;

    let githubUserId;
    try {
        githubUserId = await getGitHubUserId(githubUsername);
        console.log(`[${githubUsername}] Found GitHub user ID: ${githubUserId}`);
    } catch (error) {
        console.error(`[${githubUsername}] Could not find GitHub user (status=${error.status}):`, error.message);
        await notify(error.status, `Could not find a GitHub user with the username "${githubUsername}": ${error.message}`);
        return;
    }

    try {
        const inviteRes = await inviteToOrg(organization, githubUserId);
        console.log(`[${githubUsername}] Invited to ${organization}.`);

        const repoCreated = await createRepo(organization, githubUsername, repoName, notify);
        if (repoCreated) {
            await notify(inviteRes.status,
                `Invitation sent to ${githubUsername} successfully.\n\nGo to ${orgInviteUrl} to accept the invitation.\nYour repo: ${repoUrl}`
            );
        }
    } catch (error) {
        if (error.status !== 422) {
            console.error(`[${githubUsername}] Failed to invite to ${organization} (status=${error.status}):`, error.message);
            await notify(error.status, `Failed to invite ${githubUsername}: ${error.message}`);
            return;
        }

        const message = error.response?.data?.errors?.[0]?.message ?? '';
        if (message.includes("is already a part of this organization")) {
            console.log(`[${githubUsername}] Already a member of ${organization}, proceeding to create repo.`);
            const repoCreated = await createRepo(organization, githubUsername, repoName, notify);
            if (repoCreated) {
                await notify(error.status,
                    `${githubUsername} was already a member of the organisation.\nYour repo: ${repoUrl}`
                );
            }
        } else {
            console.error(`[${githubUsername}] Validation error (422): ${message}`);
            await notify(error.status, `Validation error for ${githubUsername}: ${message}`);
        }
    }
}

async function main() {
    let coursesData;
    try {
        const raw = await fs.readFile('courses.json', 'utf-8');
        coursesData = JSON.parse(raw).map(([courseId, assignmentId, organization]) => ({
            courseId, assignmentId, organization,
        }));
        console.log(`Loaded ${coursesData.length} course(s) from courses.json`);
    } catch (err) {
        console.error('Failed to read courses.json:', err);
        process.exit(1);
    }

    for (const course of coursesData) {
        const { courseId, assignmentId, organization } = course;
        console.log(`Getting submissions for course ${courseId}, assignment ${assignmentId} (org: ${organization})`);

        const submissions = await fetchStudentSubmissions(courseId, assignmentId);
        console.log(`Found ${submissions.length} submission(s).`);

        for (const submission of submissions) {
            console.log(submission);
            await processSubmission(submission, course)
                .catch(error => console.error(`[main] Unhandled error for ${submission.githubUsername}:`, error));
        }
    }
}

main();
