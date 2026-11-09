{
  printf '%s\n' '=== Nest Climate beta.15 installer START ==='
  nest_install_beta15() {
    local project="$HOME/devProjects/homebridge-nest-climate-cntrl"
    local directory="$project/maintenance/releases/v0.5.0-beta.15"
    local helper="$directory/install-execution-beta.sh"
    if [ ! -d "$project/.git" ]; then
      printf 'Existing checkout not found: %s\n' "$project"
      return 1
    fi
    mkdir -p "$directory" || return 1
    curl -fL --retry 3 --connect-timeout 15 --max-time 60 \
      'https://raw.githubusercontent.com/pponce/homebridge-nest-climate-cntrl/c90160f191db37421d890d9ec2fef710b06fdde2/maintenance/install-execution-beta.sh' \
      -o "$helper.download" || return 1
    printf '%s  %s\n' '1b12d3095231241e7a9fcc85a40599741abd36ea0442379428f6e0291e194ffb' "$helper.download" | sha256sum --check - || return 1
    mv "$helper.download" "$helper" || return 1
    bash "$helper"
  }
  nest_install_beta15 || printf '%s\n' 'Installer could not complete. Review the output above.'
  unset -f nest_install_beta15
  printf '%s\n' '=== Nest Climate beta.15 installer END ==='
}
