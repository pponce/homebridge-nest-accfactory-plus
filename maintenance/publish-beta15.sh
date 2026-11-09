{
  printf '%s\n' '=== Nest Climate beta.15 npm publication START ==='

  climate_publish_beta15() {
    local project="$HOME/devProjects/homebridge-nest-climate-cntrl"
    local revision='c90160f191db37421d890d9ec2fef710b06fdde2'
    local directory="$project/maintenance/releases/v0.5.0-beta.15"
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
      '7cec50692e4fbc0cb39b590104bbdb7512340cb5901016465fda0597c11ab9dc' \
      "$runner.download" | sha256sum --check - || return 1

    mv "$runner.download" "$runner" || return 1
    bash "$runner"
  }

  if climate_publish_beta15; then
    printf '%s\n' 'See the publisher result above.'
  else
    printf '%s\n' 'Publication runner failed; review the message above.'
  fi

  unset -f climate_publish_beta15
  printf '%s\n' '=== Nest Climate beta.15 npm publication END ==='
}
