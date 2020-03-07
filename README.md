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
    types: [ opened, synchronize ]
  schedule:
    - cron: '* * * * *'

jobs:
  wait:
    runs-on: ubuntu-latest
    steps:
    - name: Hold Your Horses
      uses: mheap/github-action-hold-your-horses@master
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      with:
        duration: 'PT1H'
```

The duration is an ISO8601 duration. You can use `PT3M` (3 minutes), `P5D` (5 days) or [any other supported duration](https://en.wikipedia.org/wiki/ISO_8601#Durations)
