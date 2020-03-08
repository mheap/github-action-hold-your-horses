const { Toolkit } = require("actions-toolkit");
const { parse, toSeconds } = require("iso8601-duration");

// Run your GitHub Action!
Toolkit.run(async tools => {
  const isOpenedOrSynchronizedPr =
    tools.context.event == "pull_request" &&
    ["opened", "synchronize"].indexOf(tools.context.payload.action) !== -1;

  const isPrComment =
    tools.context.event == "issue_comment" &&
    tools.context.payload.action == "created";

  const isScheduled = tools.context.event == "schedule";

  if (isOpenedOrSynchronizedPr) {
    try {
      tools.log.pending("Adding pending status check");
      await addPendingStatusCheck(tools);
      tools.log.complete("Added pending status check");
    } catch (e) {
      tools.exit.failure(e.message);
    }
  } else if (isPrComment) {
    tools.command("skipwait", async (args, match) => {
      console.log(tools.context.payload);
    });
  } else if (isScheduled) {
    // It's run on schedule, so let's check if any statuses need to be updated
    tools.log.info("Schedule code");

    const requiredDelay = tools.inputs.duration || "PT10M";

    tools.log.info(`Running with duration of ${requiredDelay}`);

    const prs = (
      await tools.github.pulls.list({
        ...tools.context.repo,
        state: "open"
      })
    ).data;

    const shas = prs.map(pr => {
      return {
        merge: pr.merge_commit_sha,
        head: pr.head.sha
      };
    });

    // For each sha, check if it's due an update
    for (let ref of shas) {
      const statuses = (
        await tools.github.repos.listStatusesForRef({
          ...tools.context.repo,
          ref: ref.merge
        })
      ).data;

      tools.log.info(`Found ${statuses.length} statuses`);
      const hyhStatuses = statuses.filter(s => s.context == "hold-your-horses");

      if (hyhStatuses.length == 0) {
        tools.log.info(`No statuses for ${ref.merge}`);
        continue;
      }

      const latestStatus = hyhStatuses[0];

      if (latestStatus.state == "success") {
        tools.log.info(`Check is already success for ${ref.merge}`);
        continue;
      }

      const updatedAt = Date.parse(latestStatus.updated_at);

      let duration;
      try {
        duration = parse(requiredDelay);
      } catch (e) {
        tools.exit.failure(`Invalid duration provided: ${requiredDelay}`);
        return;
      }

      const elapsed = Math.floor((Date.now() - updatedAt) / 1000);
      const markAsSuccess = elapsed > toSeconds(duration);

      if (markAsSuccess) {
        try {
          tools.log.info(`Marking ${ref.merge} as done`);
          await addSuccessStatusCheck(tools, ref.merge);
          tools.log.info(`Marking ${ref.head} as done`);
          await addSuccessStatusCheck(tools, ref.head);
        } catch (e) {
          tools.log.error(e.message);
        }
      } else {
        tools.log.info(`Skipping ${ref.merge} and ${ref.head}`);
      }
    }
  } else {
    tools.exit.failure(`Unknown event: ${tools.context.event}`);
  }

  tools.exit.success("Action finished");
});

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
