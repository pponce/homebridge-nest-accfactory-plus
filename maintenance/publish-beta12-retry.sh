{
  printf '%s\n' '=== Nest Climate beta.12 npm retry START ==='

  climate_publish_beta12_retry() {
    local project="$HOME/devProjects/homebridge-nest-climate-cntrl"
    local revision='408262fa6ad3af116fa39370ffc8d9ae74e1ce61'
    local directory="$project/maintenance/releases/v0.5.0-beta.12"
    local runner="$directory/update-checkout-and-publish-beta-retry.sh"

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
      '401d3ec1bc93fc6051cd9f491b7402756ebd1c5a2f9abc997b631fb49a47f659' \
      "$runner.download" | sha256sum --check - || return 1

    mv "$runner.download" "$runner" || return 1
    bash "$runner"
  }

  if climate_publish_beta12_retry; then
    printf '%s\n' 'See the publisher result above.'
  else
    printf '%s\n' 'Publication runner failed; review the message above.'
  fi

  unset -f climate_publish_beta12_retry
  printf '%s\n' '=== Nest Climate beta.12 npm retry END ==='
}
