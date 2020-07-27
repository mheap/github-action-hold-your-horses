const { Toolkit } = require("actions-toolkit");
const mockedEnv = require("mocked-env");
const nock = require("nock");
nock.disableNetConnect();
var MockDate = require("mockdate");

const merge_commit_sha = "253187c4c33beddeb518eb331e4efaf41b2f4feb";
const sha = "fe4f4ff2f32bc41d04757bfbae347f8be189d091";

describe("Hold Your Horses", () => {
  let action, tools, restore, restoreTest;
  Toolkit.run = jest.fn((actionFn) => {
    action = actionFn;
  });
  require(".");

  beforeEach(() => {
    restore = mockedEnv({
      GITHUB_WORKFLOW: "Hold Your Horses",
      GITHUB_ACTION: "Hold Your Horses Action",
      GITHUB_ACTOR: "mheap",
      GITHUB_WORKSPACE: "/tmp",
      GITHUB_SHA: merge_commit_sha,
      GITHUB_REPOSITORY: "mheap/test-repo-hyh-stream",
      GITHUB_EVENT_NAME: "",
      GITHUB_EVENT_PATH: "",
    });

    tools = new Toolkit();
    tools.context.loadPerTestEnv = function () {
      this.payload = process.env.GITHUB_EVENT_PATH
        ? require(process.env.GITHUB_EVENT_PATH)
        : {};
      this.event = process.env.GITHUB_EVENT_NAME;
    };

    tools.exit.success = jest.fn();
    tools.exit.failure = jest.fn();

    tools.log.info = jest.fn();
    tools.log.error = jest.fn();
    tools.log.pending = jest.fn();
    tools.log.complete = jest.fn();
  });

  afterEach(() => {
    restore();
    restoreTest();
    MockDate.reset();
    nock.cleanAll();
  });

  describe(`On comment`, () => {
    it(`does not trigger when the comment does not contain /skipwait`, async () => {
      restoreTest = testEnv(tools, {
        GITHUB_EVENT_NAME: "issue_comment",
        GITHUB_EVENT_PATH: `${__dirname}/fixtures/issue-comment-invalid.json`,
      });

      // No mocks as nothing should execute
      await action(tools);
      expect(tools.exit.success).toHaveBeenCalledWith("Action finished");
    });

    it(`does not trigger when /skipwait is not the first item in the comment`, async () => {
      restoreTest = testEnv(tools, {
        GITHUB_EVENT_NAME: "issue_comment",
        GITHUB_EVENT_PATH: `${__dirname}/fixtures/issue-comment-invalid-command-after.json`,
      });

      // No mocks as nothing should execute
      await action(tools);
      expect(tools.exit.success).toHaveBeenCalledWith("Action finished");
    });

    it(`responds that no-one is trusted to skip`, async () => {
      restoreTest = testEnv(tools, {
        GITHUB_EVENT_NAME: "issue_comment",
        GITHUB_EVENT_PATH: `${__dirname}/fixtures/issue-comment-valid.json`,
      });

      mockCommentAdded(
        "Sorry, skipping the required wait time isn't enabled on this repo"
      );

      await action(tools);
      expect(tools.exit.success).toHaveBeenCalledWith("Action finished");
    });

    it(`responds that the current user is not allowed to skip`, async () => {
      restoreTest = testEnv(tools, {
        GITHUB_EVENT_NAME: "issue_comment",
        GITHUB_EVENT_PATH: `${__dirname}/fixtures/issue-comment-valid.json`,
        INPUT_TRUSTED: "oneuser,another_user",
      });

      mockCommentAdded(
        "Sorry, you're not in the list of approved users. You can ask one of the following people to comment for you if needed: \n * oneuser\n * another_user"
      );

      await action(tools);
      expect(tools.exit.success).toHaveBeenCalledWith("Action finished");
    });

    it(`marks all checks as done and adds a label`, async () => {
      restoreTest = testEnv(tools, {
        GITHUB_EVENT_NAME: "issue_comment",
        GITHUB_EVENT_PATH: `${__dirname}/fixtures/issue-comment-valid.json`,
        INPUT_TRUSTED: "mheap",
      });

      mockGetSinglePr(8);
      mockStatuses([["pending", "2020-03-07T16:50:47Z"]]);
      mockUpdateStatus("success", "Review time elapsed").reply(200);
      mockUpdateStatus("success", "Review time elapsed", sha).reply(200);
      mockLabelAdded(["hold-your-horses:skipped"]);

      await action(tools);
      expect(tools.exit.success).toHaveBeenCalledWith("Action finished");
    });
  });

  ["opened", "synchronize"].forEach((event) => {
    describe(`On PR ${event}`, () => {
      it(`runs to completion`, async () => {
        restoreTest = testEnv(tools, {
          GITHUB_EVENT_NAME: "pull_request",
          GITHUB_EVENT_PATH: `${__dirname}/fixtures/pr-${event}.json`,
        });

        mockUpdateStatus(
          "pending",
          "Giving others the opportunity to review"
        ).reply(200);

        await action(tools);
        expect(tools.log.pending).toHaveBeenCalledWith(
          "Adding pending status check"
        );
        expect(tools.log.complete).toHaveBeenCalledWith(
          "Added pending status check"
        );
        expect(tools.exit.success).toHaveBeenCalledWith("Action finished");
      });

      it(`handles errors`, async () => {
        restoreTest = testEnv(tools, {
          GITHUB_EVENT_NAME: "pull_request",
          GITHUB_EVENT_PATH: `${__dirname}/fixtures/pr-${event}.json`,
        });

        mockUpdateStatus(
          "pending",
          "Giving others the opportunity to review"
        ).reply(422, {
          message: `No commit found for SHA: ${merge_commit_sha}`,
          documentation_url:
            "https://developer.github.com/v3/repos/statuses/#create-a-status",
        });

        await action(tools);
        expect(tools.log.pending).toHaveBeenCalledWith(
          "Adding pending status check"
        );
        expect(tools.exit.failure).toHaveBeenCalledWith(
          `No commit found for SHA: ${merge_commit_sha}`
        );
      });
    });
  });

  describe(`On schedule`, () => {
    describe(`Setting the duration`, () => {
      it("has a default duration", async () => {
        restoreTest = scheduleTrigger(tools);
        mockAllSuccessRequests();
        await action(tools);
        expect(tools.log.info).toHaveBeenCalledWith(
          "Running with duration of PT10M"
        );
        expect(tools.exit.success).toHaveBeenCalledWith("Action finished");
      });

      it("accepts a user specified duration", async () => {
        restoreTest = scheduleTrigger(tools, "PT3M");
        mockAllSuccessRequests();
        await action(tools);
        expect(tools.log.info).toHaveBeenCalledWith(
          "Running with duration of PT3M"
        );
        expect(tools.exit.success).toHaveBeenCalledWith("Action finished");
      });

      // Duration isn't parseable
      it("fails when the duration isn't parseable", async () => {
        restoreTest = scheduleTrigger(tools, "invalid_duration");
        mockAllSuccessRequests();
        await action(tools);
        expect(tools.exit.failure).toHaveBeenCalledWith(
          "Invalid duration provided: invalid_duration"
        );
      });
    });

    describe(`Changing check state`, () => {
      it("updates the status when the required duration has elapsed (default)", async () => {
        restoreTest = scheduleTrigger(tools, "PT10M");
        // The pending event occured at 2020-03-07T16:50:47Z
        // which means for the duration to have elapsed, we should mock the
        // current time to be more than 10 minutes later
        MockDate.set("2020-03-07T17:02:12Z");

        // Mock all the other requests
        mockAllSuccessRequests();

        await action(tools);
        expect(tools.log.info).toHaveBeenCalledWith(
          `Marking ${merge_commit_sha} as done`
        );
        expect(tools.log.info).toHaveBeenCalledWith(`Marking ${sha} as done`);
        expect(tools.exit.success).toHaveBeenCalledWith("Action finished");
      });

      it("chooses the first date based label when a custom duration is enabled", async () => {
        restoreTest = scheduleTrigger(
          tools,
          "PT10M",
          "bug=PT30M,feature=PT45M"
        );

        // The pending event occured at 2020-03-07T16:50:47Z
        // which means for the duration to have elapsed, we should mock the
        // current time to be more than 30 minutes later
        MockDate.set("2020-03-07T17:22:12Z");

        // Mock all the other requests
        mockAllSuccessRequests([
          {
            name: "bug",
          },
          {
            name: "feature",
          },
        ]);

        await action(tools);
        expect(tools.log.info).toHaveBeenCalledWith(
          `Running with duration of PT30M`
        );
        expect(tools.log.info).toHaveBeenCalledWith(
          `Marking ${merge_commit_sha} as done`
        );
        expect(tools.log.info).toHaveBeenCalledWith(`Marking ${sha} as done`);
        expect(tools.exit.success).toHaveBeenCalledWith("Action finished");
      });

      it("skips the update when the required duration has not elapsed", async () => {
        restoreTest = scheduleTrigger(tools, "PT10M");
        // The pending event occured at 2020-03-07T16:50:47Z
        // which means for the duration to NOT have elapsed, we should mock the
        // current time to be less than 10 minutes later
        MockDate.set("2020-03-07T16:53:12Z");

        // Mock all the other requests
        mockAllSuccessRequests();

        await action(tools);
        expect(tools.log.info).toHaveBeenCalledWith(
          `Skipping ${merge_commit_sha} and ${sha}`
        );
        expect(tools.exit.success).toHaveBeenCalledWith("Action finished");
      });

      it("handles the most recent check already being a success", async () => {
        restoreTest = scheduleTrigger(tools);

        mockOpenPulls();
        mockStatuses([
          ["success", "2020-03-07T16:54:12Z"],
          ["pending", "2020-03-07T16:50:47Z"],
        ]);

        await action(tools);
        expect(tools.log.info).toHaveBeenCalledWith(
          `Check is already success for ${merge_commit_sha}`
        );
        expect(tools.exit.success).toHaveBeenCalledWith("Action finished");
      });
    });

    describe("Unexpected cases", () => {
      it("handles errors when updating the merge commit status to success", async () => {
        restoreTest = scheduleTrigger(tools);

        mockOpenPulls();
        mockStatuses([["pending", "2020-03-07T16:50:47Z"]]);

        mockUpdateStatus("success", "Review time elapsed").reply(422, {
          message: `No commit found for SHA: ${merge_commit_sha}`,
          documentation_url:
            "https://developer.github.com/v3/repos/statuses/#create-a-status",
        });

        await action(tools);
        expect(tools.log.error).toHaveBeenCalledWith(
          `No commit found for SHA: ${merge_commit_sha}`
        );
        expect(tools.exit.success).toHaveBeenCalledWith("Action finished");
      });

      it("handles errors when updating the head commit status to success", async () => {
        restoreTest = scheduleTrigger(tools);

        mockOpenPulls();
        mockStatuses([["pending", "2020-03-07T16:50:47Z"]]);

        mockUpdateStatus("success", "Review time elapsed").reply(200);
        mockUpdateStatus("success", "Review time elapsed", sha).reply(422, {
          message: `No commit found for SHA: ${sha}`,
          documentation_url:
            "https://developer.github.com/v3/repos/statuses/#create-a-status",
        });

        await action(tools);
        expect(tools.log.error).toHaveBeenCalledWith(
          `No commit found for SHA: ${sha}`
        );
        expect(tools.exit.success).toHaveBeenCalledWith("Action finished");
      });

      it("handles no statuses being present for the provided ref", async () => {
        restoreTest = scheduleTrigger(tools);

        mockOpenPulls();
        mockStatuses([]);

        await action(tools);
        expect(tools.log.info).toHaveBeenCalledWith(`Found 0 statuses`);
        expect(tools.log.info).toHaveBeenCalledWith(
          `No statuses for ${merge_commit_sha}`
        );
        expect(tools.exit.success).toHaveBeenCalledWith("Action finished");
      });

      it("handles statuses being returned, but none with the correct context", async () => {
        restoreTest = scheduleTrigger(tools);

        mockOpenPulls();
        // Mock Statuses
        nock("https://api.github.com")
          .get(
            `/repos/mheap/test-repo-hyh-stream/commits/${merge_commit_sha}/statuses`
          )
          .reply(200, [
            {
              state: "success",
              context: "some-other-check",
              updated_at: "2018-01-01T00:00:00~",
            },
          ]);

        await action(tools);
        expect(tools.log.info).toHaveBeenCalledWith(`Found 1 statuses`);
        expect(tools.log.info).toHaveBeenCalledWith(
          `No statuses for ${merge_commit_sha}`
        );
        expect(tools.exit.success).toHaveBeenCalledWith("Action finished");
      });
    });
  });
});

function testEnv(tools, params) {
  const r = mockedEnv(params);
  tools.context.loadPerTestEnv();
  return r;
}

function scheduleTrigger(tools, duration, labels) {
  const opts = {
    GITHUB_EVENT_NAME: "schedule",
    GITHUB_EVENT_PATH: `${__dirname}/fixtures/schedule.json`,
  };

  if (duration) {
    opts["INPUT_DURATION"] = duration;
  }

  if (labels) {
    opts["INPUT_LABEL_DURATIONS"] = labels;
  }

  return testEnv(tools, opts);
}

function mockUpdateStatus(state, description, mockSha) {
  // Default to the merge commit, but allow a value to be passed
  // in case we need to overwrite it
  mockSha = mockSha || merge_commit_sha;

  return nock("https://api.github.com").post(
    `/repos/mheap/test-repo-hyh-stream/statuses/${mockSha}`,
    {
      state,
      context: "hold-your-horses",
      description,
    }
  );
}

function mockOpenPulls(labels) {
  nock("https://api.github.com")
    .get("/repos/mheap/test-repo-hyh-stream/pulls?state=open")
    .reply(200, [
      {
        merge_commit_sha,
        head: {
          sha,
        },
        labels: labels || [],
      },
    ]);
}

function mockStatuses(states) {
  const response = [];
  for (let s of states) {
    response.push({
      state: s[0],
      context: "hold-your-horses",
      updated_at: s[1],
    });
  }

  nock("https://api.github.com")
    .get(
      `/repos/mheap/test-repo-hyh-stream/commits/${merge_commit_sha}/statuses`
    )
    .reply(200, response);
}

function mockAllSuccessRequests(labels) {
  mockOpenPulls(labels);
  mockStatuses([["pending", "2020-03-07T16:50:47Z"]]);

  mockUpdateStatus("success", "Review time elapsed").reply(200);
  mockUpdateStatus("success", "Review time elapsed", sha).reply(200);
}

function mockCommentAdded(body) {
  nock("https://api.github.com")
    .post("/repos/mheap/test-repo-hyh-stream/issues/8/comments", {
      body,
    })
    .reply(200);
}

function mockGetSinglePr(number) {
  nock("https://api.github.com")
    .get(`/repos/mheap/test-repo-hyh-stream/pulls/${number}`)
    .reply(200, {
      merge_commit_sha,
      head: {
        sha,
      },
    });
}

function mockLabelAdded(labels) {
  nock("https://api.github.com")
    .post("/repos/mheap/test-repo-hyh-stream/issues/8/labels", {
      labels,
    })
    .reply(200);
}
