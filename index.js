const { Toolkit } = require('actions-toolkit')

// Run your GitHub Action!
Toolkit.run(async tools => {
  tools.github.repos.createStatus({
    ...tools.context.repo,
    sha: tools.context.sha,
    state: "pending"
  });
})
