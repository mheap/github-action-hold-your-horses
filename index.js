const { Toolkit } = require("actions-toolkit");
const { parse, toSeconds } = require("iso8601-duration");

// Run your GitHub Action!
Toolkit.run(async tools => {
  const isOpenedOrSynchronizedPr =
    tools.context.event == "pull_request" &&
    ["opened", "synchronize"].includes(tools.context.payload.action);

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
    await tools.command("skipwait", async (args, match) => {
      // Check if they're in the list of approved users
      const trusted = tools.inputs.trusted || "";
      const allowed = trusted
        .split(",")
        .map(n => n.toLowerCase())
        .filter(n => n);
      const currentUser = tools.context.actor.toLowerCase();

      // If they are, update the checks immediately
      if (allowed.includes(currentUser)) {
        const pr = (
          await tools.github.pulls.get({
            ...tools.context.repo,
            pull_number: tools.context.issue.number
          })
        ).data;

        const ref = {
          merge: pr.merge_commit_sha,
          head: pr.head.sha
        };

        await updateShas(tools, ref, "PT0M"); // We require zero wait when forcing

        // Then flag the PR as being skipped
        tools.github.issues.addLabels({
          ...tools.context.repo,
          issue_number: tools.context.issue.number,
          labels: ["hold-your-horses:skipped"]
        });
      } else {
        // Otherwise let them know that they're not in the list, and how to resolve it
        let body = "";
        if (allowed.length == 0) {
          body =
            "Sorry, skipping the required wait time isn't enabled on this repo";
        } else {
          const nameList = allowed.map(name => `\n * ${name}`).join("");
          body = `Sorry, you're not in the list of approved users. You can ask one of the following people to comment for you if needed: ${nameList}`;
        }

        await tools.github.issues.createComment({
          ...tools.context.repo,
          issue_number: tools.context.issue.number,
          body
        });
      }
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
      await updateShas(tools, ref, requiredDelay);
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

async function updateShas(tools, ref, requiredDelay) {
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
    return;
  }

  const latestStatus = hyhStatuses[0];

  if (latestStatus.state == "success") {
    tools.log.info(`Check is already success for ${ref.merge}`);
    return;
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
