{
  printf '%s\n' '=== Nest Climate release update START ==='
  climate_download_release_asset() {
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
  climate_install_release() {
    local project="$HOME/devProjects/homebridge-nest-climate-cntrl"
    local version='0.5.2'
    local package='homebridge-nest-climate-cntrl'
    local directory="$project/maintenance/releases/v$version"
    local archive="$package-$version.tgz"
    local expected install_status=0 start_status=0 tool
    for tool in curl sha256sum tar node sudo hb-service awk; do
      command -v "$tool" >/dev/null || { printf 'Missing command: %s\n' "$tool"; return 1; }
    done
    if [ ! -d "$project/.git" ]; then
      printf 'Expected the existing project at %s. No new checkout was created.\n' "$project"
      return 1
    fi
    mkdir -p "$directory" || return 1
    climate_download_release_asset "$package" "$version" "$archive" "$directory/$archive" || return 1
    climate_download_release_asset "$package" "$version" SHA256SUMS "$directory/SHA256SUMS" || return 1
    expected=$(awk -v name="$archive" '$2 == name { print $1 }' "$directory/SHA256SUMS")
    if [[ ! "$expected" =~ ^[[:xdigit:]]{64}$ ]]; then
      printf '%s\n' 'The release checksum is missing or ambiguous. Nothing was installed.'
      return 1
    fi
    printf '%s  %s\n' "$expected" "$directory/$archive" | sha256sum --check - || return 1
    tar -xOf "$directory/$archive" package/package.json | node -e '
      let text = "";
      process.stdin.on("data", part => text += part);
      process.stdin.on("end", () => {
        const pkg = JSON.parse(text);
        if (pkg.name !== process.argv[1] || pkg.version !== process.argv[2]) throw new Error("Unexpected release package");
        console.log("Verified " + pkg.name + "@" + pkg.version);
      });
    ' "$package" "$version" || return 1
    printf '%s\n' 'Stopping Homebridge, installing the verified GitHub package, then starting Homebridge.'
    sudo hb-service stop || return 1
    sudo hb-service add "$directory/$archive" || install_status=$?
    sudo hb-service start || start_status=$?
    if [ "$install_status" -ne 0 ] || [ "$start_status" -ne 0 ]; then
      printf 'Install status: %s; start status: %s. Inspect /var/lib/homebridge/homebridge.log.\n' "$install_status" "$start_status"
      return 1
    fi
    printf '%s\n' 'Update complete. Open the climate dashboard and refresh the page.'
    printf '%s\n' 'For a read-only sensor report: Overview -> Diagnose Nest sensor selection -> Download sensor diagnostics.'
    printf '%s\n' 'Enabled rules recover after current feedback arrives. Resume only rules that are paused.'
  }
  if climate_install_release; then
    printf '%s\n' 'RESULT: SUCCESS'
  else
    printf '%s\n' 'RESULT: FAILED — review the message above.'
  fi
  unset -f climate_install_release climate_download_release_asset
  printf '%s\n' '=== Nest Climate release update END ==='
}
