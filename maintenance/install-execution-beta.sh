{
  printf '%s\n' '=== Nest Climate execution beta update START ==='
  climate_install_execution_beta() {
    local project="$HOME/devProjects/homebridge-nest-climate-cntrl"
    local version='0.5.0-beta.8'
    local package='homebridge-nest-climate-cntrl'
    local release="https://github.com/pponce/$package/releases/download/v$version"
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
    curl --fail --location --show-error --proto '=https' --tlsv1.2 \
      "$release/$archive" -o "$directory/$archive.download" || return 1
    curl --fail --location --show-error --proto '=https' --tlsv1.2 \
      "$release/SHA256SUMS" -o "$directory/SHA256SUMS.download" || return 1
    expected=$(awk -v name="$archive" '$2 == name { print $1 }' "$directory/SHA256SUMS.download")
    if [[ ! "$expected" =~ ^[[:xdigit:]]{64}$ ]]; then
      printf '%s\n' 'The release checksum is missing or ambiguous. Nothing was installed.'
      return 1
    fi
    printf '%s  %s\n' "$expected" "$directory/$archive.download" | sha256sum --check - || return 1
    tar -xOf "$directory/$archive.download" package/package.json | node -e '
      let text = "";
      process.stdin.on("data", part => text += part);
      process.stdin.on("end", () => {
        const pkg = JSON.parse(text);
        if (pkg.name !== process.argv[1] || pkg.version !== process.argv[2]) throw new Error("Unexpected release package");
        console.log("Verified " + pkg.name + "@" + pkg.version);
      });
    ' "$package" "$version" || return 1
    mv "$directory/$archive.download" "$directory/$archive" || return 1
    printf '%s\n' 'Stopping Homebridge, installing the verified GitHub package, then starting Homebridge.'
    sudo hb-service stop || return 1
    sudo hb-service add "$directory/$archive" || install_status=$?
    sudo hb-service start || start_status=$?
    if [ "$install_status" -ne 0 ] || [ "$start_status" -ne 0 ]; then
      printf 'Install status: %s; start status: %s. Inspect /var/lib/homebridge/homebridge.log.\n' "$install_status" "$start_status"
      return 1
    fi
    printf '%s\n' 'Update complete. Open the climate dashboard and refresh the page.'
    printf '%s\n' 'Existing drafts remain disabled. Enable and save only the rules you want to test.'
    printf '%s\n' 'After subsequent bridge restarts, review and Resume temperature/fan rules explicitly.'
  }
  if climate_install_execution_beta; then
    printf '%s\n' 'RESULT: SUCCESS'
  else
    printf '%s\n' 'RESULT: FAILED — review the message above.'
  fi
  unset -f climate_install_execution_beta
  printf '%s\n' '=== Nest Climate execution beta update END ==='
}

