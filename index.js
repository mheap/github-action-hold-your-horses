const { Toolkit } = require('actions-toolkit')

// Run your GitHub Action!
Toolkit.run(async tools => {

  if (tools.context.event == "pull_request" && ['opened', 'synchronize'].indexOf(tools.context.payload.action) !== -1) {
    // If the PR is opened or synchronized
    await addPendingStatusCheck(tools);
  } else {
    // It's run on schedule, so let's check if any statuses need to be updated
    tools.log.info("Schedule code");
    const prs = (await tools.github.pulls.list({
      ...tools.context.repo
    })).data;

    const shas = prs.map((pr) => {
      return pr.head.sha
    });

    console.log(shas);
  }
  tools.exit.success("Action finished");
})

function addPendingStatusCheck(tools) {
  return tools.github.repos.createStatus({
    ...tools.context.repo,
    sha: tools.context.sha,
    state: "pending",
    context: "hold-your-horses",
    description: "Giving others the opportunity to review"
  });
}
