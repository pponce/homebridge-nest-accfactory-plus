{
  printf '%s\n' '=== Nest Climate Cntrl checkout + beta publish START ==='
  nest_publish_report=''
  nest_publish_head=''
  nest_publish_umask=$(umask)
  umask 077
  nest_publish_beta() {
    local project="$HOME/devProjects/homebridge-nest-climate-cntrl"
    local package='homebridge-nest-climate-cntrl' version='0.5.0-beta.10'
    local release_url="https://github.com/pponce/$package/releases/download/v$version"
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
    for asset in "$package-$version.tgz" SHA256SUMS; do
      curl -fsSL --retry 3 --max-time 60 "$release_url/$asset" -o "$release_dir/$asset" || return 1
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
    printf '%s\n' 'Checking npm sign-in. Complete login/2FA here if prompted.'
    npm --cache "$release_dir/npm-cache" whoami --registry=https://registry.npmjs.org >/dev/null 2>&1 ||
      npm --cache "$release_dir/npm-cache" login --registry=https://registry.npmjs.org || return 1
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
        --ignore-scripts --access public --tag beta --registry=https://registry.npmjs.org || return 1
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
  if nest_publish_beta; then nest_publish_result=0; else nest_publish_result=$?; fi
  if [ -n "$nest_publish_report" ]; then
    node - "$nest_publish_report" "$nest_publish_result" "$nest_publish_head" <<'NODE'
const fs = require('node:fs');
fs.writeFileSync(process.argv[2], JSON.stringify({
  generatedAt: new Date().toISOString(), package: 'homebridge-nest-climate-cntrl', version: '0.5.0-beta.10',
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
  unset -f nest_publish_beta
  unset nest_publish_report nest_publish_head nest_publish_result nest_publish_umask nest_publish_copy_host
}

