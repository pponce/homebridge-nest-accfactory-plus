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
      'https://raw.githubusercontent.com/pponce/homebridge-nest-climate-cntrl/a0edf649623d3e77894395e570112e1aba51a14c/maintenance/install-execution-beta.sh' \
      -o "$helper.download" || return 1
    printf '%s  %s\n' 'c2da9622c5cce8ccd601751d83504cf8754d3739b1561cf6844447ab37961c7e' "$helper.download" | sha256sum --check - || return 1
    mv "$helper.download" "$helper" || return 1
    bash "$helper"
  }
  nest_install_beta15 || printf '%s\n' 'Installer could not complete. Review the output above.'
  unset -f nest_install_beta15
  printf '%s\n' '=== Nest Climate beta.15 installer END ==='
}
