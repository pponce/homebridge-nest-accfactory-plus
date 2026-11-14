{
  printf '%s\n' '=== Nest Climate 0.6.9 npm publication START ==='

  climate_publish_stable069() {
    local project="$HOME/devProjects/homebridge-nest-climate-cntrl"
    local revision='v0.6.9'
    local directory="$project/maintenance/releases/v0.6.9"
    local runner="$directory/update-checkout-and-publish-release.sh"

    if [ ! -d "$project/.git" ]; then
      printf 'Existing project not found: %s\n' "$project"
      return 1
    fi

    mkdir -p "$directory" || return 1

    if ! curl --fail --location --show-error --retry 2 \
      --connect-timeout 15 --max-time 60 \
      --proto '=https' --tlsv1.2 \
      "https://raw.githubusercontent.com/pponce/homebridge-nest-climate-cntrl/$revision/maintenance/update-checkout-and-publish-release.sh" \
      -o "$runner.download"; then
      printf '%s\n' 'Source download failed; fetching the pinned script through Git...'
      git -C "$project" fetch --no-tags \
        https://github.com/pponce/homebridge-nest-climate-cntrl.git \
        "$revision" || return 1
      git -C "$project" show \
        "FETCH_HEAD:maintenance/update-checkout-and-publish-release.sh" \
        > "$runner.download" || return 1
    fi

    printf '%s  %s\n' \
      '396de54c3c7a283b33eb4006750623382ced140ae8149d4df320ff375afa2ea1' \
      "$runner.download" | sha256sum --check - || return 1

    mv "$runner.download" "$runner" || return 1
    bash "$runner"
  }

  if climate_publish_stable069; then
    printf '%s\n' 'See the publisher result above.'
  else
    printf '%s\n' 'Publication runner failed; review the message above.'
  fi

  unset -f climate_publish_stable069
  printf '%s\n' '=== Nest Climate 0.6.9 npm publication END ==='
}

