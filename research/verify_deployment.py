"""Verify the published artifact, authentication boundary, and one live assessment."""
import argparse
import hashlib
import json
import urllib.error
import urllib.request

from common import ROOT, PROTOCOL, post, write_json
from dev_context import fixtures


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 ContextGuardResearch/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--version", default="not supplied")
    args = parser.parse_args()
    base = args.url.rstrip("/")
    build = hashlib.sha256(b"".join((ROOT / p).read_bytes() for p in [
        "src/research/policy.ts", "src/research/schema.ts", "src/server.ts"])).hexdigest()
    status, raw = get(base + "/api/health")
    health = json.loads(raw)
    assert status == 200 and health["researchProtocol"] == PROTOCOL and health["researchBuildId"] == build
    status, page = get(base + "/research")
    assert status == 200 and b'<div id="root">' in page
    status, raw = get(base + "/research-results.json")
    reports = json.loads(raw)
    assert status == 200 and reports == json.loads((ROOT / "public/research-results.json").read_text())
    status, figure = get(base + "/research-comparison.svg")
    assert status == 200 and b"<svg" in figure
    assert get(base + "/api/research/assess")[0] == 401
    assert get(base + "/agents/chat-agent/research-lab-v1")[0] == 401
    live = post(base, "assess", fixtures()[0]["body"])
    assert live["protocol"] == PROTOCOL and live["buildId"] == build and len(live["decisions"]) == 6
    verification = dict(url=base, cloudflareVersionId=args.version, buildId=build,
        checks={"health": True, "researchPage": True, "publishedReportsMatchLocal": True,
            "figure": True, "unauthorizedApiRejected": True, "researchSessionProtected": True,
            "liveAssessment": True}, liveModelId=live["modelId"], liveLatencyMs=live["latencyMs"])
    write_json(ROOT / "research/results/deployment-verification.json", verification)
    print(json.dumps(verification, indent=2))


if __name__ == "__main__":
    main()
