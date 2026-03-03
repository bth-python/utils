import 'dotenv/config'
import { Octokit } from "octokit";
import fs from 'fs/promises';

// const REPO_URL = `https://github.com/${process.env["ORGANIZATION"]}/${process.env["REPO"]}`;
const EMAILREGEX = /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/i;
const GITHUB_USERNAME_INDEX = 0;
const EMAIL_INDEX = 1;
const USER_ID_INDEX = 2;
const ATTEMPT_INDEX = 3;
const COURSE_INDEX = 0;
const ASSIGNMENT_INDEX = 1;
const ORGANIZATION_INDEX = 2;

const octokit = new Octokit({
    auth: process.env["GITHUB_TOKEN"]
})


async function fetchStudentSubmissions(courseID, assignmentID) {
    let submitted = []
    let result = []
    let i = 1
    do {
        submitted = submitted.concat(result.filter(item => item.workflow_state === "submitted").map(item => {
            const matches = item.body.replace(/<[^>]*>/g, '').trim();
            
            if (matches) {
                return [matches, item.user.login_id, item.user.id, item.attempt];
            } else {
                return [null, item.user.login_id, item.user.id, item.attempt]
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


async function addStudentsToGitHubOrganizationAndCreateRepo(submission, course) {
    const ORG_URL = `https://github.com/orgs/${course[ORGANIZATION_INDEX]}/invitation`;
    let updateCanvas = updateCanvasPartial(course[COURSE_INDEX], course[ASSIGNMENT_INDEX], submission[USER_ID_INDEX], submission[ATTEMPT_INDEX])
    
    if (submission[EMAIL_INDEX] === null) {
        console.error(`[submission user=${submission[USER_ID_INDEX]}] Could not extract a GitHub username from submission.`);
        updateCanvas(410, `Could not extract a GitHub username from submission.`);
    } else {
        const acronym = submission[EMAIL_INDEX].split('@')[0];
        const repoName = `algo-${acronym}`;

        try { // get github user id
            const userRes = await octokit.request('GET /users/{username}', {
            username: submission[GITHUB_USERNAME_INDEX],
            headers: {
                'X-GitHub-Api-Version': '2022-11-28',
            },
            });

            const githubUserId = userRes.data.id;
            console.log(userRes.data.login, githubUserId);

            try {
                const inviteRes = await octokit.request('POST /orgs/{org}/invitations', {
                    org: course[ORGANIZATION_INDEX],
                    invitee_id: githubUserId,
                    role: 'direct_member',
                    headers: {
                    'X-GitHub-Api-Version': '2022-11-28',
                    },
                });

                const repoCreated = await createRepo(course[ORGANIZATION_INDEX], submission[GITHUB_USERNAME_INDEX], repoName, updateCanvas);
                if (repoCreated) {
                    updateCanvas(inviteRes.status, `Invitation sent to ${submission[GITHUB_USERNAME_INDEX]} successfully.\n\nGo to ${ORG_URL} to accept the invitation. A repo has been created for you and you have been added as a collaborator. Your repo: ${ORG_URL}/${repoName}`);
                }
            } catch (error) {
                console.log(error);
                
                if (error.status === 422) { // User already in org or validation error
                    const message = error.response?.data?.errors?.[0]?.message;

                    if (message?.includes("is already a part of this organization")) {
                        console.log(`[${submission[GITHUB_USERNAME_INDEX]}] Already a member of ${course[ORGANIZATION_INDEX]}, proceeding to create repo.`);

                        const repoCreated = await createRepo(course[ORGANIZATION_INDEX], submission[GITHUB_USERNAME_INDEX], repoName, updateCanvas);
                        if (repoCreated) {
                            updateCanvas(error.status, `${submission[GITHUB_USERNAME_INDEX]} was already a member of the organisation\n\nA repo has been created for you and you have been added as a collaborator. Your repo: ${ORG_URL}/${repoName}`);
                        }
                    } else {
                        console.error(`[${submission[GITHUB_USERNAME_INDEX]}] Validation error (422): ${message}`);
                        updateCanvas(error.status, `Validation error for ${submission[GITHUB_USERNAME_INDEX]}:\n${message}`);
                    }
                } else {
                    console.error(`[${submission[GITHUB_USERNAME_INDEX]}] Failed to invite to ${course[ORGANIZATION_INDEX]} (status=${error.status}):`, error);
                    updateCanvas(error.status, `Failed to invite ${submission[GITHUB_USERNAME_INDEX]}: ${error}`);
                }
            }
        } catch (error) {
                console.log(error);
                updateCanvas(error.status, `Could not find a GitHub user with the username ${submission[GITHUB_USERNAME_INDEX]}:\n${message}`);
            }
        return
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
    
} catch (err) {
    console.error('Failed to read courses.json:', err);
}

for (const course of coursesData) {
    console.log(`Getting submissions for course ${course}`);
    
    const submissions = await fetchStudentSubmissions(course[COURSE_INDEX], course[ASSIGNMENT_INDEX])
    console.log(`Found emails: ${submissions}`);
    // let submissions;
    // if (course[ORGANIZATION_INDEX] === "bth-algo") {
    // let submissions = [[ 'aarstud', 'aarstud@student.bth.se', 32763, 16 ]];
        for (const submission of submissions) {
            console.log(submission);
            
            await addStudentsToGitHubOrganizationAndCreateRepo(submission, course)
            .catch((error) => console.error(`[main] Unhandled error for submission ${submission[GITHUB_USERNAME_INDEX]}:`, error));
        }
    // }
    // addStudentsToGitHubOrganization(emailsIds, course, course[ORGANIZATION_INDEX]);
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
