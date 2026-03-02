import 'dotenv/config'
import { Octokit } from "octokit";
import fs from 'fs/promises';

// const REPO_URL = `https://github.com/${process.env["ORGANIZATION"]}/${process.env["REPO"]}`;
const EMAILREGEX = /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/i;
const EMAILINDEX = 0;
const USERIDINDEX = 1;
const ATTEMPTINDEX = 2;
const COURSEINDEX = 0;
const ASSIGNMENTINDEX = 1;
const ORGANIZATIONINDEX = 2;

const octokit = new Octokit({
    auth: process.env["GITHUB_TOKEN"]
})


async function fetchStudentSubmissions(courseID, assignmentID) {
    let submitted = []
    let result = []
    let i = 1
    do {
        submitted = submitted.concat(result.filter(item => item.workflow_state === "submitted").map(item => {
            const matches = item.body.match(EMAILREGEX);
            if (matches) {
                return [matches[0], item.user.id, item.attempt];
            } else {
                return [null, item.user.id, item.attempt]
            }
        }));
        
        const url = `https://bth.instructure.com/api/v1/courses/${courseID}/assignments/${assignmentID}/submissions?per_page=100&page=${i}&include[]=user`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${process.env.CANVAS_TOKEN}`,
            },
        });

        if (!response.ok) {
            console.error(`[fetchStudentSubmissions] HTTP error fetching page ${i} (status=${response.status}): ${response.statusText}`);
            break;
        }

        result = await response.json();
        i++;
        
    } while (result.length > 0 )

    return submitted;
}

function updateCanvas(courseID, assignmentID, user, attempt, status, comment) {
    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/x-www-form-urlencoded");
    myHeaders.append("Authorization", `Bearer ${process.env.CANVAS_TOKEN}`,);
    console.log(`Updating Canvas for user ${user} with status ${status} and comment: ${comment}`);

    const urlencoded = new URLSearchParams();
    if ([201, 422].includes(status)) {
        urlencoded.append("submission[posted_grade]", "G");
        urlencoded.append("comment[text_comment]", comment);
    } else {
        urlencoded.append("submission[posted_grade]", "Ux");
        urlencoded.append("comment[text_comment]", comment + "\n\nKontakta kursansvarig om du behöver hjälp.");
    }
    urlencoded.append("comment[attempt]", attempt)

    const requestOptions = {
    method: "PUT",
    headers: myHeaders,
    body: urlencoded,
    redirect: "follow"
    };

    fetch(`https://bth.instructure.com/api/v1/courses/${courseID}/assignments/${assignmentID}/submissions/${user}`, requestOptions)
    .catch((error) => console.error(error));
    // .then((response) => response.text())
    // .then((result) => console.log(result)
}

const updateCanvasPartial = (courseID, assignmentID, user, attempt) => {
    return (status, comment) => {
        updateCanvas(courseID, assignmentID, user, attempt, status, comment  );
    } 
}

async function getGitHubUsernameFromEmail(email) {
    try {
        const res = await octokit.request('GET /search/users', {
            q: `${email} in:email`,
            headers: {
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });
        if (res.data.total_count > 0) {
            return res.data.items[0].login;
        }
        console.error(`[getGitHubUsernameFromEmail] No GitHub user found for email: ${email}`);
        return null;
    } catch (error) {
        console.error(`[getGitHubUsernameFromEmail] Failed to find GitHub username for ${email} (status=${error.status}):`, error.message);
        return null;
    }
}

async function addStudentsToGitHubOrganizationAndCreateRepo(submission, course, organization) {
    const ORG_URL = `https://github.com/orgs/${organization}/invitation`;
    let updateCanvas = updateCanvasPartial(course[COURSEINDEX], course[ASSIGNMENTINDEX], submission[USERIDINDEX], submission[ATTEMPTINDEX])
    
    if (submission[EMAILINDEX] === null) {
        console.error(`[submission user=${submission[USERIDINDEX]}] Could not extract valid email address from submission.`);
        updateCanvas(410, `Could not extract valid email adress from submission.`);
    } else {
        const acronym = submission[EMAILINDEX].split('@')[0];
        const repoName = `algo-${acronym}`;
        try {
            const res = await octokit.request('POST /orgs/{org}/invitations', {
                org: organization,
                email: submission[EMAILINDEX],
                role: 'direct_member',
                headers: {
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            });
            if (res.status === 201) {
                const repoCreated = await createRepo(organization, res.data.login, repoName, updateCanvas);
                if (repoCreated) {
                    updateCanvas(res.status, `Invitation sent to ${submission[EMAILINDEX]} successfully.\n\nGo to ${ORG_URL} to accept the invitation. A repo has been created for you and you have been added as a collaborator. Your repo: ${organization}/${repoName}`);
                }  
            }
        } catch (error) {
            console.log(error);
            
            if (error.status === 422) {
                const message = error.response?.data?.errors?.[0]?.message;

                if (message?.includes("is already a part of this organization")) {
                    console.log(`[${submission[EMAILINDEX]}] Already a member of ${organization}, proceeding to create repo.`);
                    const login = await getGitHubUsernameFromEmail(submission[EMAILINDEX]);
                    const repoCreated = await createRepo(organization, login, repoName, updateCanvas);
                    if (repoCreated) {
                        updateCanvas(error.status, `${submission[EMAILINDEX]} is already a member of the organization, ${ORG_URL}. `);
                    }
                } else {
                    console.error(`[${submission[EMAILINDEX]}] Validation error (422): ${message}`);
                    updateCanvas(error.status, `Validation error for ${submission[EMAILINDEX]}:\n${message}`);
                }
            } else {
                console.error(`[${submission[EMAILINDEX]}] Failed to invite to ${organization} (status=${error.status}):`, error);
                updateCanvas(error.status, `Failed to invite ${submission[EMAILINDEX]}: ${error}`);
            }
        }
    }
}

async function createRepo(organization, login, repoName, updateCanvas) {
    try {
        await octokit.request('POST /repos/{template_owner}/{template_repo}/generate', {
            template_owner: organization,
            template_repo: 'template',
            owner: organization,
            name: repoName,
            private: true,
            headers: {
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });
    } catch (error) {
        if (error.status === 422) {
            console.error(`[${repoName}] Repository already exists (422).`);
            updateCanvas(error.status, `Repository ${repoName} already exists.\n\nKontakta kursansvarig om du behöver hjälp.`);
        } else {
            console.error(`[${repoName}] Failed to create repository (status=${error.status}):`, error.message);
            updateCanvas(error.status, `Failed to create repository ${repoName}: ${error.message}\n\nKontakta kursansvarig om du behöver hjälp.`);
        }
        return false;
    }

    try {
        await octokit.request('PUT /repos/{owner}/{repo}/collaborators/{username}', {
            owner: organization,
            repo: repoName,
            username: login,
            permission: 'push',
            headers: {
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });
    } catch (error) {
        console.error(`[${repoName}] Failed to add ${login} as collaborator (status=${error.status}):`, error.message);
        updateCanvas(error.status, `Failed to add ${login} as collaborator to ${repoName}: ${error.message}\n\nKontakta kursansvarig om du behöver hjälp.`);
        return false;
    }

    return true;
}

let coursesData;
try {
    const data = await fs.readFile('courses.json', 'utf-8');
    coursesData = JSON.parse(data);
    console.log(`Loaded ${coursesData} courses from courses.json`);
    
    // You can now use coursesData as needed
} catch (err) {
    console.error('Failed to read courses.json:', err);
}

for (const course of coursesData) {
    console.log(`Getting submissions for course ${course}`);
    
    // const submissions = await fetchStudentSubmissions(course[COURSEINDEX], course[ASSIGNMENTINDEX])
    // console.log(`Found emails: ${submissions}`);
    // let submissions;
    if (course[ORGANIZATIONINDEX] === "bth-algo") {
        let submissions = [["aarstud@student.bth.se", "aarstud"]];
        for (const submission of submissions) {
            await addStudentsToGitHubOrganizationAndCreateRepo(submission, course, course[ORGANIZATIONINDEX])
            .catch((error) => console.error(`[main] Unhandled error for submission ${submission[EMAILINDEX]}:`, error));
        }
    }
    // addStudentsToGitHubOrganization(emailsIds, course, course[ORGANIZATIONINDEX]);
}





// ANVÄNDS INTE

// async function inviteStudentsToRepo(username) {
//     try {
//         const res = await octokit.request('PUT /repos/{owner}/{repo}/collaborators/{username}', {
//             owner: process.env["ORGANIZATION"],
//             repo: process.env["REPO"],
//             username: username,
//             permission: 'read',
//             headers: {
//                 'X-GitHub-Api-Version': '2022-11-28'
//             }
//         });
//         if (res.status === 201) {
//             console.log(`Invitation sent to user ${username} successfully. Go to ${REPO_URL} to accept the invitation.`);
//         } else if (res.status === 204) {
//             console.log(`User${username} successfully added to repo. Go to ${REPO_URL} to view repo.`);
//         }
//     } catch (error) {
//         if (error.status === 422) {
//             console.error(`Failed to invite ${username}:`, error);
//         }
//     }

// }


// async function isUserInOrg(org, username) {
//     try {
//         const response = await octokit.request("GET /orgs/{org}/members/{username}", {
//             org: process.env["ORGANIZATION"],
//             username: username,
//             headers: {
//                 'X-GitHub-Api-Version': '2022-11-28'
//             }
//         });
//         return true; // 204 No Content = user is a member
//     } catch (error) {
//         if (error.status === 404) {
//             return false; // Not a member
//         }
//         console.error("Unexpected error:", error);
//         throw error; // Rethrow other errors
//     }
// }


// const isMember = await isUserInOrg(usernames[0]);

// console.log(`Is member: ${isMember}`);

// if (isMember) {
//     console.log(await inviteStudentsToRepo(usernames[0]));
// } else {
//     console.log(`User ${usernames[0]} is not a member of the organization. Do assignment for invite to organisation first.`);
// }
