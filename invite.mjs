import { log } from 'console';
import 'dotenv/config'
import { Octokit } from "octokit";

const REPO_URL = `https://github.com/${process.env["ORGANIZATION"]}/${process.env["REPO"]}`;
const ORG_URL = `https://github.com/orgs/${process.env["ORGANIZATION"]}/invitation`;

const octokit = new Octokit({
    auth: process.env["GITHUB_TOKEN"]
})

async function addStudentsToGitHubOrganization(submission) {
    // Kan inte få ut invite länk från res. Måste ha hårdkodat länk till där de kan accepter eller så få de kolla sin mejl
    try {
        const res = await octokit.request('POST /orgs/{org}/invitations', {
            org: process.env["ORGANIZATION"],
            email: submission,
            role: 'direct_member',
            headers: {
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });
        if (res.status === 201) {
            console.log(`Invitation sent to ${submission} successfully. Go to ${ORG_URL} to accept the invitation.`);
        }
    } catch (error) {
        if (error.status === 422) {
            // GitHub returns 422 if user already invited or in org
            const message = error.response?.data?.errors?.[0]?.message;

            if (message?.includes("is already a part of this organization")) {
                console.log(`${submission} is already a member of the organization.`);
            } else {
                console.error(`Validation error for ${submission}:`, message);
            }
        } else {
            // Any other unexpected error
            console.error(`Failed to invite ${submission}:`, error);
        }
    }
}

async function inviteStudentsToRepo(username) {
    try {
        const res = await octokit.request('PUT /repos/{owner}/{repo}/collaborators/{username}', {
            owner: process.env["ORGANIZATION"],
            repo: process.env["REPO"],
            username: username,
            permission: 'read',
            headers: {
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });
        if (res.status === 201) {
            console.log(`Invitation sent to user ${username} successfully. Go to ${REPO_URL} to accept the invitation.`);
        } else if (res.status === 204) {
            console.log(`User${username} successfully added to repo. Go to ${REPO_URL} to view repo.`);
        }
    } catch (error) {
        if (error.status === 422) {
            console.error(`Failed to invite ${username}:`, error);
        }
    }

}


async function isUserInOrg(org, username) {
    try {
        const response = await octokit.request("GET /orgs/{org}/members/{username}", {
            org: process.env["ORGANIZATION"],
            username: username,
            headers: {
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });
        return true; // 204 No Content = user is a member
    } catch (error) {
        if (error.status === 404) {
            return false; // Not a member
        }
        console.error("Unexpected error:", error);
        throw error; // Rethrow other errors
    }
}


const emails = [
    "trashshop123@proton.me"
];
// console.log(await addStudentsToGitHubOrganization(emails[0]));

const usernames = [
    "aarstud" 
];


// for (let i = 0; i < submissions.length; i++) {
//     if (submissions[i]) {

// }


const isMember = await isUserInOrg(usernames[0]);

console.log(`Is member: ${isMember}`);

if (isMember) {
    console.log(await inviteStudentsToRepo(usernames[0]));
} else {
    console.log(`User ${usernames[0]} is not a member of the organization. Do assignment for invite to organisation first.`);
}
