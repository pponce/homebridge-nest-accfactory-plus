{
  printf '%s\n' '=== Nest Climate beta.18 npm publication START ==='

  climate_publish_beta18() {
    local project="$HOME/devProjects/homebridge-nest-climate-cntrl"
    local revision='f738882b62385d9cef10eb72f038495fc66178d6'
    local directory="$project/maintenance/releases/v0.5.0-beta.18"
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
      '0fba56e519646344eb7233052b88eb1b219692a531227d98aefa1a23cf3736f5' \
      "$runner.download" | sha256sum --check - || return 1

    mv "$runner.download" "$runner" || return 1
    bash "$runner"
  }

  if climate_publish_beta18; then
    printf '%s\n' 'See the publisher result above.'
  else
    printf '%s\n' 'Publication runner failed; review the message above.'
  fi

  unset -f climate_publish_beta18
  printf '%s\n' '=== Nest Climate beta.18 npm publication END ==='
}
