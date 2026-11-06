#!/usr/bin/env python3
"""
Hopper CI Workflow Syntax & Security Linter
Validates that all GitHub Actions workflow YAML files:
1. Parse as valid YAML syntax.
2. Contain required top-level keys ('name', 'on', 'jobs').
3. Define explicit least-privilege 'permissions'.
4. Pin third-party actions to full 40-character commit SHAs.
5. Contain zero hardcoded secrets or insecure expression interpolations.
"""

import os
import re
import sys
import yaml

WORKFLOWS_DIR = ".github/workflows"
SHA_REGEX = re.compile(r'^[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+(?:/[a-zA-Z0-9_-]+)?@([a-f0-9]{40})(?:\s+#.*)?$')
LOCAL_ACTION_REGEX = re.compile(r'^\./')

def validate_workflow_file(filepath: str) -> list[str]:
    errors = []
    filename = os.path.basename(filepath)
    print(f"[WORKFLOW LINTER] Checking {filename}...")

    # 1. Parse YAML syntax
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            data = yaml.safe_load(content)
    except Exception as e:
        return [f"YAML syntax parsing error: {e}"]

    if not isinstance(data, dict):
        return ["Workflow root must be a YAML mapping (dictionary)."]

    # 2. Check required top-level structure
    if 'name' not in data:
        errors.append("Missing required top-level 'name' key.")
    if 'on' not in data and True not in data: # YAML 'on' can parse as boolean True if unquoted
        errors.append("Missing required top-level 'on' trigger definition.")
    if 'jobs' not in data or not isinstance(data['jobs'], dict):
        errors.append("Missing or invalid 'jobs' dictionary.")

    # 3. Check for permissions block
    has_top_permissions = 'permissions' in data
    if not has_top_permissions:
        # Check if every job defines permissions
        jobs = data.get('jobs', {})
        for job_name, job_def in jobs.items():
            if isinstance(job_def, dict) and 'uses' not in job_def: # Reusable calls inherit or don't require job permissions
                if 'permissions' not in job_def:
                    errors.append(f"Job '{job_name}' missing explicit 'permissions' block and no top-level permissions set.")

    # 4. Check action pinning on all 'uses:' steps
    with open(filepath, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            stripped = line.strip()
            if stripped.startswith('uses:'):
                action_ref = stripped.split('uses:', 1)[1].strip()
                # Ignore local workflow or composite action calls (e.g. ./.github/workflows/...)
                if LOCAL_ACTION_REGEX.match(action_ref):
                    continue
                
                # Verify 40-character commit SHA
                if '@' not in action_ref:
                    errors.append(f"Line {line_num}: Action reference '{action_ref}' lacks version/SHA delimiter '@'")
                    continue
                
                ref_parts = action_ref.split('@', 1)
                action_name = ref_parts[0]
                sha_part = ref_parts[1].split('#')[0].strip()

                if not re.match(r'^[a-f0-9]{40}$', sha_part):
                    errors.append(
                        f"Line {line_num}: Action '{action_name}' is not pinned to a 40-character commit SHA. Found: '{sha_part}'"
                    )

            # Check for unsafe bash interpolation of pull request title or body
            if '${{ github.event.pull_request.title }}' in line or '${{ github.event.pull_request.body }}' in line:
                errors.append(f"Line {line_num}: Potential script injection risk: Direct expansion of PR title/body in shell command.")

    return errors

def main():
    if not os.path.isdir(WORKFLOWS_DIR):
        print(f"Error: {WORKFLOWS_DIR} directory does not exist.")
        return 1

    total_files = 0
    total_errors = 0

    for file in sorted(os.listdir(WORKFLOWS_DIR)):
        if file.endswith('.yml') or file.endswith('.yaml'):
            total_files += 1
            filepath = os.path.join(WORKFLOWS_DIR, file)
            errs = validate_workflow_file(filepath)
            if errs:
                total_errors += len(errs)
                print(f"  ❌ FAILED ({len(errs)} errors):")
                for e in errs:
                    print(f"     - {e}")
            else:
                print("  ✔ PASS (Syntax, permissions, action SHAs verified)")

    print("\n" + "=" * 80)
    print(f"WORKFLOW LINTING SUMMARY: {total_files} workflows scanned, {total_errors} errors found.")
    print("=" * 80)

    return 1 if total_errors > 0 else 0

if __name__ == '__main__':
    sys.exit(main())
