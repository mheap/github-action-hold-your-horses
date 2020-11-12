# Hold Your Horses!

This GitHub Action can be used to enforce a minimum review time for pull requests. It's user configurable, but defaults to 10 minutes.

Enforcing a minimum review time can be useful when you have multiple domain experts that may not see the PR immediately.

> On a personal note, I used to work at a company where either I'd merge whilst someone else was mid review, or they would merge when I was mid review. This action would have prevented me/them from doing so

## Usage

You'll need to configure your repo to have required status checks. Once this action has run once, it will show up and you can check the required box. This is what prevents people from merging

To add this action, create a file located at `.github/workflows/hold_your_horses.yml` with the following contents:

```yaml
name: Hold Your Horses
on:
  pull_request:
    types: [opened, synchronize]
  schedule:
    - cron: "* * * * *"

jobs:
  wait:
    runs-on: ubuntu-latest
    steps:
      - name: Hold Your Horses
        uses: mheap/github-action-hold-your-horses@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          duration: "PT1H"
          trusted: mheap,other_user
          label_durations: bug=PT30M,feature=P1D
```

The duration is an ISO8601 duration. You can use `PT3M` (3 minutes), `P5D` (5 days) or [any other supported duration](https://en.wikipedia.org/wiki/ISO_8601#Durations)

The `trusted` input allows you to specify a list of usernames that can skip waiting for the minimum time. This can be useful for urgent bug fixes.

The `label_durations` input allows you to have customisable wait durations depending on the labels applied to a PR. If multiple labels are applied, the matching label is used.

## Skipping the wait

Any users specified in the workflow's `trusted` input can add a comment to the pull request containing `/skipwait`. This will immediately change the status of the pull request to `success` and add a label of `hold-your-horses:skipped` so that you can filter any PRs that have been skipped at a later date.
