{
  printf '%s\n' '=== Nest Climate 0.6.4 npm publication START ==='

  climate_publish_stable064() {
    local project="$HOME/devProjects/homebridge-nest-climate-cntrl"
    local revision='v0.6.4'
    local directory="$project/maintenance/releases/v0.6.4"
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
      'cace98fcb4378f8ebb245b26c5e1e319c6935a647be77c54b1bce2799a00aee4' \
      "$runner.download" | sha256sum --check - || return 1

    mv "$runner.download" "$runner" || return 1
    bash "$runner"
  }

  if climate_publish_stable064; then
    printf '%s\n' 'See the publisher result above.'
  else
    printf '%s\n' 'Publication runner failed; review the message above.'
  fi

  unset -f climate_publish_stable064
  printf '%s\n' '=== Nest Climate 0.6.4 npm publication END ==='
}

