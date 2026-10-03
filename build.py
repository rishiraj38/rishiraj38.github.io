#!/usr/bin/env python3
"""Rebuild the portfolio with fresh pull-request data from GitHub.

    python3 build.py

Needs the `gh` CLI, logged in. Writes:
  index.html      the deployable site (any static host)
  dist/page.html  the same page without the document shell
"""
import datetime
import json
import pathlib
import subprocess

USER = "rishiraj38"
ROOT = pathlib.Path(__file__).parent


def gh(*args):
    return subprocess.run(["gh", *args], check=True, capture_output=True, text=True).stdout


def search(state_flag, date_field, status):
    raw = gh("search", "prs", "--author", USER, state_flag, "--limit", "500",
             "--json", f"repository,title,number,{date_field}")
    rows = []
    for pr in json.loads(raw):
        repo = pr["repository"]["nameWithOwner"]
        if repo.startswith(USER + "/"):
            continue
        rows.append({"d": pr[date_field][:10], "r": repo, "t": pr["title"].strip(), "n": pr["number"], "s": status})
    return rows


def count(query):
    return int(gh("api", "-X", "GET", "search/issues", "-f", f"q={query}", "-f", "per_page=1", "--jq", ".total_count"))


prs = search("--merged", "closedAt", "m") + search("--state=open", "createdAt", "o")
meta = {
    "reviewed": count(f"reviewed-by:{USER} type:pr -author:{USER}"),
    "contributions": int(gh(
        "api", "graphql", "-f",
        'query={user(login:"%s"){contributionsCollection{contributionCalendar{totalContributions}}}}' % USER,
        "--jq", ".data.user.contributionsCollection.contributionCalendar.totalContributions")),
    "asOf": datetime.date.today().isoformat(),
}


def embed(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


page = (ROOT / "src" / "page.html").read_text()
page = page.replace("__DATA__", embed(prs)).replace("__META__", embed(meta))

# every src/fx/<name>.css and .js is inlined; each script gets its own tag so one broken module cannot stop the rest
fx = ""
for css in sorted((ROOT / "src" / "fx").glob("*.css")):
    fx += f"<style>/* fx/{css.name} */\n{css.read_text()}\n</style>\n"
for js in sorted((ROOT / "src" / "fx").glob("*.js")):
    body = js.read_text().replace("</script", "<\\/script")
    fx += f"<script>/* fx/{js.name} */\ntry {{\n{body}\n}} catch (e) {{ console.error('fx/{js.name}', e); }}\n</script>\n"
page = page.replace("__FX__", fx)

(ROOT / "dist").mkdir(exist_ok=True)
(ROOT / "dist" / "page.html").write_text(page)

DESC = "Open-source engineer. Maintainer in the Layer5 and Meshery ecosystem, CNCF LFX mentee 2026."
ICON = ("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E"
        "%3Crect width='32' height='32' rx='7' fill='%236336E0'/%3E"
        "%3Ccircle cx='11' cy='9' r='3' fill='%23fff'/%3E%3Ccircle cx='11' cy='23' r='3' fill='%23fff'/%3E"
        "%3Ccircle cx='22' cy='16' r='3' fill='%23fff'/%3E"
        "%3Cpath d='M11 9v14M11 12c0 4 11 0 11 4' stroke='%23fff' stroke-width='2' fill='none'/%3E%3C/svg%3E")
shell = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="{DESC}">
<meta property="og:title" content="Rishi Raj">
<meta property="og:description" content="{DESC}">
<meta property="og:type" content="website">
<link rel="icon" href="{ICON}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
</head>
<body>
{page}
</body>
</html>
"""
(ROOT / "index.html").write_text(shell)
print(f"{sum(p['s'] == 'm' for p in prs)} merged, {sum(p['s'] == 'o' for p in prs)} open, {meta['reviewed']} reviewed")
