{
  printf '%s\n' '=== Nest Climate Cntrl checkout + beta publish START ==='
  nest_publish_report=''
  nest_publish_head=''
  nest_publish_umask=$(umask)
  umask 077
  nest_download_release_asset() {
    local package="$1" version="$2" asset="$3" destination="$4"
    local release_url="https://github.com/pponce/$package/releases/download/v$version"
    local api="https://api.github.com/repos/pponce/$package" asset_id
    printf 'Downloading %s...\n' "$asset"
    if curl -fsSL --retry 2 --connect-timeout 15 --max-time 60 --proto '=https' --tlsv1.2 \
      "$release_url/$asset" -o "$destination.download"; then
      mv "$destination.download" "$destination" || return 1
      return 0
    fi
    printf '%s\n' 'Release download failed. Trying the GitHub asset API...'
    curl -fsSL --retry 2 --connect-timeout 15 --max-time 60 --proto '=https' --tlsv1.2 \
      -H 'Accept: application/vnd.github+json' \
      "$api/releases/tags/v$version" -o "$destination.release.json" || return 1
    asset_id=$(node - "$destination.release.json" "$version" "$asset" <<'NODE'
const fs = require('node:fs');
const release = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const assets = Array.isArray(release.assets) ? release.assets.filter(asset => asset.name === process.argv[4]) : [];
if (release.tag_name !== 'v' + process.argv[3] || release.draft !== false || assets.length !== 1 ||
    !Number.isSafeInteger(assets[0].id) || assets[0].id <= 0 || assets[0].state !== 'uploaded') {
  throw new Error('GitHub did not report the expected published release asset.');
}
console.log(assets[0].id);
NODE
    ) || return 1
    curl -fsSL --retry 2 --connect-timeout 15 --max-time 60 --proto '=https' --tlsv1.2 \
      -H 'Accept: application/octet-stream' \
      "$api/releases/assets/$asset_id" -o "$destination.download" || return 1
    mv "$destination.download" "$destination" || return 1
  }
  nest_ensure_github_release() {
    local package="$1" version="$2" release_dir="$3"
    local api="https://api.github.com/repos/pponce/$package" status attempt validation requested=false
    printf 'GitHub release: https://github.com/pponce/%s/releases/tag/v%s\n' "$package" "$version"
    for attempt in {1..90}; do
      status=$(curl -sSL --retry 2 --connect-timeout 15 --max-time 30 --proto '=https' --tlsv1.2 \
        -H 'Accept: application/vnd.github+json' -w '%{http_code}' \
        "$api/releases/tags/v$version" -o "$release_dir/github-release.json") || return 1
      case "$status" in
        200)
          node - "$release_dir/github-release.json" "$package" "$version" <<'NODE'
const fs = require('node:fs');
const release = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const [name, version] = process.argv.slice(3);
if (release.tag_name !== 'v' + version || release.draft !== false || release.prerelease !== true) {
  console.error('GitHub did not report the expected published beta release.');
  process.exitCode = 1;
} else {
  const ready = [name + '-' + version + '.tgz', 'SHA256SUMS'].every(name =>
    release.assets?.filter(asset => asset.name === name && asset.state === 'uploaded').length === 1);
  process.exitCode = ready ? 0 : 2;
}
NODE
          validation=$?
          if [ "$validation" -eq 0 ]; then
            printf '%s\n' 'GitHub release and package assets are ready. Continuing to npm.'
            return 0
          fi
          if [ "$validation" -ne 2 ]; then return 1; fi
          ;;
        404)
          if [ "$requested" = false ]; then
            if ! command -v gh >/dev/null || ! gh auth status --hostname github.com >/dev/null 2>&1; then
              printf '%s\n' 'Starting a GitHub release requires an authenticated GitHub CLI on this host.' \
                'You can also open this workflow link, choose Run workflow on main, then rerun this script:' \
                "https://github.com/pponce/$package/actions/workflows/release.yml"
              return 1
            fi
            printf '%s\n' 'Starting the GitHub release workflow. It validates the package before publishing.'
            gh workflow run release.yml --repo "pponce/$package" --ref main || return 1
            requested=true
          fi
          ;;
        *) printf 'GitHub release lookup returned HTTP %s. npm publication was not attempted.\n' "$status"; return 1 ;;
      esac
      printf 'Waiting for the tested GitHub release and assets (%s/90)...\n' "$attempt"
      if [ "$attempt" -lt 90 ]; then sleep 10; fi
    done
    printf '%s\n' 'GitHub release is not ready. npm publication was not attempted. Review the workflow and rerun after it succeeds:' \
      "https://github.com/pponce/$package/actions/workflows/release.yml"
    return 1
  }
  nest_publish_beta() {
    case "${1:-}" in ''|--github-release) ;; *) printf '%s\n' 'Supported option: --github-release'; return 1 ;; esac
    local project="$HOME/devProjects/homebridge-nest-climate-cntrl"
    local package='homebridge-nest-climate-cntrl' version='0.5.0-beta.20'
    local release_dir="$project/maintenance/releases/v$version"
    local asset origin branch worktree_status ignored tool attempt tag_value
    for tool in git curl node npm tar sha256sum; do
      command -v "$tool" >/dev/null || { printf 'Missing command: %s\n' "$tool"; return 1; }
    done
    if [ ! -d "$project/.git" ]; then
      printf 'Expected the existing checkout at %s. No repository was created.\n' "$project"
      return 1
    fi
    origin=$(git -C "$project" remote get-url origin) || return 1
    case "$origin" in
      https://github.com/pponce/homebridge-nest-climate-cntrl|https://github.com/pponce/homebridge-nest-climate-cntrl.git|git@github.com:pponce/homebridge-nest-climate-cntrl.git) ;;
      https://github.com/pponce/homebridge-nest-accfactory-plus|https://github.com/pponce/homebridge-nest-accfactory-plus.git)
        git -C "$project" remote set-url origin "https://github.com/pponce/$package.git" || return 1 ;;
      git@github.com:pponce/homebridge-nest-accfactory-plus.git)
        git -C "$project" remote set-url origin "git@github.com:pponce/$package.git" || return 1 ;;
      *) printf '%s\n' 'Unexpected origin. Review the checkout before publishing.'; return 1 ;;
    esac
    for ignored in /maintenance/releases/ /maintenance/migration/ /maintenance/artifacts/; do
      if ! git -C "$project" check-ignore -q --no-index "${ignored#/}private-file"; then
        printf '\n%s\n' "$ignored" >> "$project/.git/info/exclude" || return 1
      fi
      git -C "$project" check-ignore -q --no-index "${ignored#/}private-file" || return 1
    done
    branch=$(git -C "$project" branch --show-current) || return 1
    worktree_status=$(git -C "$project" status --porcelain) || return 1
    if [ "$branch" != main ] || [ -n "$worktree_status" ]; then
      printf '%s\n' 'Checkout must be on main with no local changes. Nothing was stashed, reset or backed up.'
      printf 'Current branch: %s\n' "${branch:-detached HEAD}"
      if [ -n "$worktree_status" ]; then printf '%s\n' "$worktree_status"; fi
      return 1
    fi
    printf '%s\n' 'Fetching main and release tags; updating by fast-forward only...'
    git -C "$project" fetch origin --prune --tags || return 1
    git -C "$project" merge --ff-only --no-overwrite-ignore origin/main || return 1
    nest_publish_head=$(git -C "$project" rev-parse HEAD) || return 1
    if [ "$nest_publish_head" != "$(git -C "$project" rev-parse origin/main)" ]; then
      printf '%s\n' 'Local main contains extra commits. Review it before publishing.'
      return 1
    fi
    git -C "$project" merge-base --is-ancestor "v$version" HEAD || return 1
    git -C "$project" submodule update --init --recursive || return 1
    node - "$project/package.json" "$package" "$version" <<'NODE'
const fs = require('node:fs');
const pkg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (pkg.name !== process.argv[3] || pkg.version !== process.argv[4]) {
  console.error('Checkout version differs from this publisher. Use the publisher for the intended release.');
  process.exitCode = 1;
}
NODE
    if [ "$?" -ne 0 ]; then return 1; fi
    mkdir -p "$release_dir" || return 1
    chmod 700 "$release_dir" || return 1
    nest_publish_report="$release_dir/publish-result-$(date -u +%Y%m%dT%H%M%SZ).json"
    if [ "${1:-}" = --github-release ]; then
      nest_ensure_github_release "$package" "$version" "$release_dir" || return 1
    fi
    for asset in "$package-$version.tgz" SHA256SUMS; do
      nest_download_release_asset "$package" "$version" "$asset" "$release_dir/$asset" || return 1
    done
    node - "$release_dir" "$package" "$version" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const [dir, name, version] = process.argv.slice(2);
const filename = name + '-' + version + '.tgz';
const archive = path.join(dir, filename);
const sums = fs.readFileSync(path.join(dir, 'SHA256SUMS'), 'utf8').trim().split(/\r?\n/);
const entries = sums.map(line => line.match(/^([a-f0-9]{64})\s+\*?(.+)$/)).filter(m => m && m[2] === filename);
const actual = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
if (entries.length !== 1 || entries[0][1] !== actual) throw new Error('Release tarball checksum mismatch.');
const pkg = JSON.parse(execFileSync('tar', ['-xOf', archive, 'package/package.json'], { encoding: 'utf8' }));
if (pkg.name !== name || pkg.version !== version) throw new Error('Release tarball package/version mismatch.');
console.log('Verified tested GitHub package: ' + name + '@' + version);
NODE
    if [ "$?" -ne 0 ]; then return 1; fi
    printf '%s\n' 'Checking npm sign-in. If npm prints a URL, open it on your computer and complete sign-in. This terminal will wait for confirmation.'
    npm --cache "$release_dir/npm-cache" whoami --registry=https://registry.npmjs.org >/dev/null 2>&1 ||
      npm --cache "$release_dir/npm-cache" login --auth-type=web --browser=false --registry=https://registry.npmjs.org || return 1
    if npm --cache "$release_dir/npm-cache" view "$package@$version" dist.integrity --json --prefer-online \
      --fetch-retries=0 --fetch-timeout=10000 --registry=https://registry.npmjs.org \
      > "$release_dir/registry-integrity.json" 2> "$release_dir/registry-error.log"; then
      printf '%s\n' 'Version already exists; verifying it without publishing again.'
    elif [ -f "$release_dir/npm-upload-accepted" ]; then
      printf '%s\n' 'An upload was already accepted; checking propagation without publishing again.'
    elif node - "$release_dir/registry-error.log" <<'NODE'
const fs = require('node:fs');
process.exitCode = /\bE404\b/.test(fs.readFileSync(process.argv[2], 'utf8')) ? 0 : 1;
NODE
    then
      npm --cache "$release_dir/npm-cache" publish "$release_dir/$package-$version.tgz" \
        --ignore-scripts --access public --tag beta --browser=false --registry=https://registry.npmjs.org || return 1
      printf '%s\n' "$package@$version" > "$release_dir/npm-upload-accepted" || return 1
    else
      printf '%s\n' 'Registry lookup failed for a reason other than a missing version. No publication attempted.'
      return 1
    fi
    for attempt in {1..30}; do
      printf 'Verifying npm availability (%s/30)...\n' "$attempt"
      if npm --cache "$release_dir/npm-cache" view "$package@$version" dist.integrity --json --prefer-online \
        --fetch-retries=0 --fetch-timeout=10000 --registry=https://registry.npmjs.org \
        > "$release_dir/registry-integrity.json" 2> "$release_dir/registry-error.log"; then
        node - "$release_dir/$package-$version.tgz" "$release_dir/registry-integrity.json" <<'NODE'
const fs = require('node:fs');
const crypto = require('node:crypto');
const expected = 'sha512-' + crypto.createHash('sha512').update(fs.readFileSync(process.argv[2])).digest('base64');
if (JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) !== expected) {
  console.error('Published package differs from the tested release. Stop and review.');
  process.exitCode = 1;
}
NODE
        if [ "$?" -ne 0 ]; then return 1; fi
        tag_value=$(npm --cache "$release_dir/npm-cache" view "$package@beta" version --prefer-online \
          --fetch-retries=0 --fetch-timeout=10000 --registry=https://registry.npmjs.org 2>/dev/null)
        if [ "$tag_value" = "$version" ]; then
          printf 'Published and verified: %s@%s (beta).\n' "$package" "$version"
          return 0
        fi
      fi
      if [ "$attempt" -lt 30 ]; then sleep 10; fi
    done
    printf '%s\n' 'Registry or beta-tag verification is pending. Rerun this script later; it will not republish an accepted upload.'
    return 2
  }
  if nest_publish_beta "$@"; then nest_publish_result=0; else nest_publish_result=$?; fi
  if [ -n "$nest_publish_report" ]; then
    node - "$nest_publish_report" "$nest_publish_result" "$nest_publish_head" <<'NODE'
const fs = require('node:fs');
fs.writeFileSync(process.argv[2], JSON.stringify({
  generatedAt: new Date().toISOString(), package: 'homebridge-nest-climate-cntrl', version: '0.5.0-beta.20',
  result: ({ 0: 'verified', 2: 'pending_verification' })[process.argv[3]] || 'failed',
  checkoutCommit: process.argv[4], homebridgeChanged: false,
}, null, 2) + '\n', { mode: 0o600 });
NODE
    if [ "$?" -eq 0 ]; then
      nest_publish_copy_host=$(printf '%s' "${SSH_CONNECTION:-}" | awk '{print $3}')
      if [ -z "$nest_publish_copy_host" ]; then nest_publish_copy_host=$(hostname); fi
      case "$nest_publish_copy_host" in *:*) nest_publish_copy_host="[$nest_publish_copy_host]" ;; esac
      printf 'Copy the result to your Mac:\nrsync -P %s@%s:%s ~/Downloads/\n' "$(id -un)" "$nest_publish_copy_host" "$nest_publish_report"
    else
      printf '%s\n' 'Could not write the publication report.'
      nest_publish_result=1
    fi
  fi
  case "$nest_publish_result" in
    0) printf '%s\n' '=== Nest Climate Cntrl checkout + beta publish END: SUCCESS ===' ;;
    2) printf '%s\n' '=== Nest Climate Cntrl checkout + beta publish END: PENDING registry verification ===' ;;
    *) printf '%s\n' '=== Nest Climate Cntrl checkout + beta publish END: FAILED — review the message above ===' ;;
  esac
  umask "$nest_publish_umask"
  unset -f nest_publish_beta nest_download_release_asset nest_ensure_github_release
  unset nest_publish_report nest_publish_head nest_publish_result nest_publish_umask nest_publish_copy_host
}
