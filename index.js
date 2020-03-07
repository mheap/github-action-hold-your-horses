const { Toolkit } = require('actions-toolkit')
const { parse, toSeconds } = require('iso8601-duration');

// Run your GitHub Action!
Toolkit.run(async tools => {

  if (tools.context.event == "pull_request" && ['opened', 'synchronize'].indexOf(tools.context.payload.action) !== -1) {
    // If the PR is opened or synchronized
    await addPendingStatusCheck(tools);
  } else {
    // It's run on schedule, so let's check if any statuses need to be updated
    tools.log.info("Schedule code");
    const prs = (await tools.github.pulls.list({
      ...tools.context.repo,
      state: "open"
    })).data;

    const shas = prs.map((pr) => {
      return pr.head.sha
    });

    // For each sha, check if it's due an update
    for (let ref of shas) {
      const statuses = (await tools.github.repos.listStatusesForRef({
        ...tools.context.repo,
        ref
      })).data;

      const hyhStatuses = statuses.filter((s) => s.context == 'hold-your-horses');

      if (hyhStatuses.length == 0) {
        tools.log.info(`No statuses for ${ref}`);
        continue;
      }

      const latestStatus = hyhStatuses[0];
      const updatedAt = Date.parse(latestStatus.updated_at);

      const duration = toSeconds( parse('PT1H') );
      const markAsSuccess = ((new Date) - updatedAt) > duration;

      if (markAsSuccess) {
        tools.log.info(`Marking ${ref} as done`);
        await addSuccessStatusCheck(tools, ref);
      } else {
        tools.log.info(`Skipping ${ref}`);
      }

    }
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

function addSuccessStatusCheck(tools, sha) {
  return tools.github.repos.createStatus({
    ...tools.context.repo,
    sha,
    state: "success",
    context: "hold-your-horses",
    description: "Review time elapsed"
  });
}
