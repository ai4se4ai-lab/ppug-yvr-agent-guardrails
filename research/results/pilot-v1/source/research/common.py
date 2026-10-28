"""Small, dependency-free client and statistics helpers for reproducible pilot runs."""
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
MODES = ["unguarded", "rules-only", "static", "adaptive", "no-evidence", "no-hierarchy"]


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def token():
    value = os.environ.get("RESEARCH_TOKEN")
    if not value:
        path = ROOT / ".research" / "research-token"
        if path.exists():
            value = path.read_text().strip()
    if not value:
        raise RuntimeError("Set RESEARCH_TOKEN or create .research/research-token")
    return value


def post(base, endpoint, body, attempts=3):
    payload = json.dumps(body).encode()
    for attempt in range(attempts):
        req = urllib.request.Request(base.rstrip("/") + "/api/research/" + endpoint,
            data=payload, headers={"Authorization": "Bearer " + token(), "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 ContextGuardResearch/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=180) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            detail = error.read().decode(errors="replace")[:500]
            if error.code < 500 or attempt == attempts - 1:
                raise RuntimeError(f"HTTP {error.code}: {detail}") from error
        except (TimeoutError, urllib.error.URLError):
            if attempt == attempts - 1:
                raise
        time.sleep(2 ** attempt)


def assess(base, body, cache_dir):
    cache_dir.mkdir(parents=True, exist_ok=True)
    key = digest({"endpoint": base, "body": body, "protocol": "v1"})
    path = cache_dir / (key + ".json")
    if path.exists():
        return json.loads(path.read_text()), True
    result = post(base, "assess", body)
    path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result, False


def wilson(successes, n):
    if not n:
        return None
    z = 1.959963984540054
    p = successes / n
    denominator = 1 + z*z/n
    center = (p + z*z/(2*n))/denominator
    half = z * math.sqrt(p*(1-p)/n + z*z/(4*n*n))/denominator
    return [max(0, center-half), min(1, center+half)]


def provenance():
    def git(*args):
        return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()
    source_files = [*sorted((ROOT / "src/research").glob("*.ts")), ROOT / "src/server.ts",
        ROOT / "research/dev_context.py", ROOT / "research/agentdojo_eval.py", ROOT / "research/common.py"]
    return {
        "repositoryCommit": git("rev-parse", "HEAD"),
        "workingTreeDirty": bool(git("status", "--porcelain")),
        "policySha256": hashlib.sha256((ROOT / "src/research/policy.ts").read_bytes()).hexdigest(),
        "schemaSha256": hashlib.sha256((ROOT / "src/research/schema.ts").read_bytes()).hexdigest(),
        "packageLockSha256": hashlib.sha256((ROOT / "package-lock.json").read_bytes()).hexdigest(),
        "sourceHashes": {str(p.relative_to(ROOT)).replace("\\", "/"): hashlib.sha256(p.read_bytes()).hexdigest() for p in source_files},
        "timestampUtc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding="utf-8")
