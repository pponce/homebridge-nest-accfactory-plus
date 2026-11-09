{
  printf '%s\n' '=== Nest Climate beta.21 npm publication START ==='

  climate_publish_beta21() {
    local project="$HOME/devProjects/homebridge-nest-climate-cntrl"
    local revision='36ed477fb68c9311f4cdaec317c060a3b7f7ed91'
    local directory="$project/maintenance/releases/v0.5.0-beta.21"
    local runner="$directory/update-checkout-and-publish-beta.sh"

    if [ ! -d "$project/.git" ]; then
      printf 'Existing project not found: %s\n' "$project"
      return 1
    fi

    mkdir -p "$directory" || return 1

    if ! curl --fail --location --show-error --retry 2 \
      --connect-timeout 15 --max-time 60 \
      --proto '=https' --tlsv1.2 \
      "https://raw.githubusercontent.com/pponce/homebridge-nest-climate-cntrl/$revision/maintenance/update-checkout-and-publish-beta.sh" \
      -o "$runner.download"; then
      printf '%s\n' 'Source download failed; fetching the pinned script through Git...'
      git -C "$project" fetch --no-tags \
        https://github.com/pponce/homebridge-nest-climate-cntrl.git \
        "$revision" || return 1
      git -C "$project" show \
        "$revision:maintenance/update-checkout-and-publish-beta.sh" \
        > "$runner.download" || return 1
    fi

    printf '%s  %s\n' \
      '16c98e8bbf976567b3e223a992810ebc91938750c453ce85f39c345eb2dadadb' \
      "$runner.download" | sha256sum --check - || return 1

    mv "$runner.download" "$runner" || return 1
    bash "$runner"
  }

  if climate_publish_beta21; then
    printf '%s\n' 'See the publisher result above.'
  else
    printf '%s\n' 'Publication runner failed; review the message above.'
  fi

  unset -f climate_publish_beta21
  printf '%s\n' '=== Nest Climate beta.21 npm publication END ==='
}
