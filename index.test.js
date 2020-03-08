const { Toolkit } = require("actions-toolkit");
const mockedEnv = require("mocked-env");
const nock = require("nock");
nock.disableNetConnect();
var MockDate = require("mockdate");

const merge_commit_sha = "253187c4c33beddeb518eb331e4efaf41b2f4feb";
const sha = "fe4f4ff2f32bc41d04757bfbae347f8be189d091";

describe("Hold Your Horses", () => {
  let action, tools, restore, restoreTest;
  Toolkit.run = jest.fn(actionFn => {
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
      GITHUB_EVENT_PATH: ""
    });

    tools = new Toolkit();
    tools.context.loadPerTestEnv = function() {
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

  ["opened", "synchronize"].forEach(event => {
    it(`runs to completion on PR ${event}`, async () => {
      restoreTest = testEnv(tools, {
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_EVENT_PATH: `${__dirname}/fixtures/pr-${event}.json`
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

    it(`handles errors on PR ${event}`, async () => {
      restoreTest = testEnv(tools, {
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_EVENT_PATH: `${__dirname}/fixtures/pr-${event}.json`
      });

      mockUpdateStatus(
        "pending",
        "Giving others the opportunity to review"
      ).reply(422, {
        message: `No commit found for SHA: ${merge_commit_sha}`,
        documentation_url:
          "https://developer.github.com/v3/repos/statuses/#create-a-status"
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

  it("runs successfully with the default duration", async () => {
    restoreTest = scheduleTrigger(tools);
    mockAllSuccessRequests();
    await action(tools);
    expect(tools.log.info).toHaveBeenCalledWith(
      "Running with duration of PT10M"
    );
    expect(tools.exit.success).toHaveBeenCalledWith("Action finished");
  });

  it("runs successfully with a user specified duration", async () => {
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

  it("updates the status when the required duration has elapsed", async () => {
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

  it("handles errors when updating the merge commit status to success", async () => {
    restoreTest = scheduleTrigger(tools);

    mockOpenPulls();
    mockStatuses([["pending", "2020-03-07T16:50:47Z"]]);

    mockUpdateStatus("success", "Review time elapsed").reply(422, {
      message: `No commit found for SHA: ${merge_commit_sha}`,
      documentation_url:
        "https://developer.github.com/v3/repos/statuses/#create-a-status"
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
        "https://developer.github.com/v3/repos/statuses/#create-a-status"
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
          updated_at: "2018-01-01T00:00:00~"
        }
      ]);

    await action(tools);
    expect(tools.log.info).toHaveBeenCalledWith(`Found 1 statuses`);
    expect(tools.log.info).toHaveBeenCalledWith(
      `No statuses for ${merge_commit_sha}`
    );
    expect(tools.exit.success).toHaveBeenCalledWith("Action finished");
  });

  it("handles the most recent check already being a success", async () => {
    restoreTest = scheduleTrigger(tools);

    mockOpenPulls();
    mockStatuses([
      ["success", "2020-03-07T16:54:12Z"],
      ["pending", "2020-03-07T16:50:47Z"]
    ]);

    await action(tools);
    expect(tools.log.info).toHaveBeenCalledWith(
      `Check is already success for ${merge_commit_sha}`
    );
    expect(tools.exit.success).toHaveBeenCalledWith("Action finished");
  });
});

function testEnv(tools, params) {
  const r = mockedEnv(params);
  tools.context.loadPerTestEnv();
  return r;
}

function scheduleTrigger(tools, duration) {
  const opts = {
    GITHUB_EVENT_NAME: "schedule",
    GITHUB_EVENT_PATH: `${__dirname}/fixtures/schedule.json`
  };

  if (duration) {
    opts["INPUT_DURATION"] = duration;
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
      description
    }
  );
}

function mockOpenPulls() {
  nock("https://api.github.com")
    .get("/repos/mheap/test-repo-hyh-stream/pulls?state=open")
    .reply(200, [
      {
        merge_commit_sha,
        head: {
          sha
        }
      }
    ]);
}

function mockStatuses(states) {
  const response = [];
  for (let s of states) {
    response.push({
      state: s[0],
      context: "hold-your-horses",
      updated_at: s[1]
    });
  }

  nock("https://api.github.com")
    .get(
      `/repos/mheap/test-repo-hyh-stream/commits/${merge_commit_sha}/statuses`
    )
    .reply(200, response);
}

function mockAllSuccessRequests() {
  mockOpenPulls();
  mockStatuses([["pending", "2020-03-07T16:50:47Z"]]);

  mockUpdateStatus("success", "Review time elapsed").reply(200);
  mockUpdateStatus("success", "Review time elapsed", sha).reply(200);
}
