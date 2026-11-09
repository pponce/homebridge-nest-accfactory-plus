{
  printf '%s\n' '=== Nest Climate beta.16 GitHub + npm publication START ==='

  climate_publish_beta16() {
    local project="$HOME/devProjects/homebridge-nest-climate-cntrl"
    local revision='a19976fd87e3a7551ff6e143443de4cacb9541a2'
    local directory="$project/maintenance/releases/v0.5.0-beta.16"
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
      'f81e0b2a1607a071521d9d9b352ec0a807a0994e1224558c08f25ae3c697a674' \
      "$runner.download" | sha256sum --check - || return 1

    mv "$runner.download" "$runner" || return 1
    bash "$runner" --github-release
  }

  if climate_publish_beta16; then
    printf '%s\n' 'See the publisher result above.'
  else
    printf '%s\n' 'Publication runner failed; review the message above.'
  fi

  unset -f climate_publish_beta16
  printf '%s\n' '=== Nest Climate beta.16 GitHub + npm publication END ==='
}
