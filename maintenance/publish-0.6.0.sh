{
  printf '%s\n' '=== Nest Climate 0.6.0 npm publication START ==='

  climate_publish_stable060() {
    local project="$HOME/devProjects/homebridge-nest-climate-cntrl"
    local revision='1b0b78a0d9aef907dabeb3f2271a30145f5993ee'
    local directory="$project/maintenance/releases/v0.6.0"
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
        "$revision:maintenance/update-checkout-and-publish-release.sh" \
        > "$runner.download" || return 1
    fi

    printf '%s  %s\n' \
      'f60f5650bb496a1a5a4dbe51783b990e7a26429d89ee920d5559ce6a8fe2c463' \
      "$runner.download" | sha256sum --check - || return 1

    mv "$runner.download" "$runner" || return 1
    bash "$runner"
  }

  if climate_publish_stable060; then
    printf '%s\n' 'See the publisher result above.'
  else
    printf '%s\n' 'Publication runner failed; review the message above.'
  fi

  unset -f climate_publish_stable060
  printf '%s\n' '=== Nest Climate 0.6.0 npm publication END ==='
}
