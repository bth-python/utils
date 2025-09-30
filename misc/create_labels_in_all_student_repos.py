import os
import requests
from requests.auth import HTTPBasicAuth
from dotenv import load_dotenv


# Load variables from .env into the environment
load_dotenv()

# Now you can access them using os.getenv
REPO_PREFIX = os.getenv('REPO_PREFIX')
GITHUB_TOKEN = os.getenv('GITHUB_TOKEN')
ORG_NAME = os.getenv('ORGANISATION')
# --- USER CONFIGURATION START ---
LABELS = [
    {
        "name": "Approved",
        "description": "Used by teachers to pass student submissions",
        "color": "0E8A16"
    },
    {
        "name": "Needs improvement",
        "description": "Used by teachers to mark submission for resubmission",
        "color": "B60205"
    },
    {
        "name": "Submitted",
        "description": "Used by students to mark submissions",
        "color": "0052CC"
    }
]
# --- USER CONFIGURATION END ---

API_BASE = "https://api.github.com"

def get_repos(org_name, prefix):
    repos = []
    page = 1
    while True:
        url = f"{API_BASE}/orgs/{org_name}/repos?per_page=100&page={page}"
        r = requests.get(url, auth=HTTPBasicAuth('', GITHUB_TOKEN))
        if r.status_code != 200:
            print(f"Failed to fetch repos: {r.status_code}, {r.text}")
            break
        data = r.json()
        if not data:
            break
        for repo in data:
            if repo["name"].startswith(prefix):
                repos.append(repo["name"])
        page += 1
    return repos

def ensure_label(repo, label):
    url = f"{API_BASE}/repos/{ORG_NAME}/{repo}/labels/{label['name'].replace(' ', '%20')}"
    headers = {"Authorization": f"token {GITHUB_TOKEN}"}
    # Check if label exists
    r = requests.get(url, headers=headers)
    if r.status_code == 200:
        # Update label if needed
        r2 = requests.patch(
            url,
            headers={**headers, "Accept": "application/vnd.github+json"},
            json={
                "new_name": label["name"],
                "description": label["description"],
                "color": label["color"]
            }
        )
        if r2.status_code in [200, 201]:
            print(f"Updated label: {label['name']} in {repo}")
        else:
            print(f"Failed to update label: {label['name']} in {repo} ({r2.status_code})")
    else:
        # Create label
        url_post = f"{API_BASE}/repos/{ORG_NAME}/{repo}/labels"
        r2 = requests.post(
            url_post,
            headers={**headers, "Accept": "application/vnd.github+json"},
            json={
                "name": label["name"],
                "description": label["description"],
                "color": label["color"]
            }
        )
        if r2.status_code in [200, 201]:
            print(f"Created label: {label['name']} in {repo}")
        else:
            print(f"Failed to create label: {label['name']} in {repo} ({r2.status_code}): {r2.text}")

def main():
    repos = get_repos(ORG_NAME, REPO_PREFIX)
    print(f"Found repos: {repos}")
    for repo in repos:
        for label in LABELS:
            ensure_label(repo, label)

if __name__ == "__main__":
    main()
