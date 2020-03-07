const { Toolkit } = require('actions-toolkit')
const mockedEnv = require('mocked-env')
const nock = require('nock')
nock.disableNetConnect()

describe('Hold Your Horses', () => {
  let action, tools, restore, restoreTest

  // Mock Toolkit.run to define `action` so we can call it
  Toolkit.run = jest.fn((actionFn) => { action = actionFn })
  // Load up our entrypoint file
  require('.')

  beforeEach(() => {
    restore = mockedEnv({
      GITHUB_WORKFLOW: 'Hold Your Horses',
      GITHUB_ACTION: 'Hold Your Horses Action',
      GITHUB_ACTOR: 'mheap',
      GITHUB_WORKSPACE: '/tmp',
      GITHUB_SHA: '253187c4c33beddeb518eb331e4efaf41b2f4feb',
      GITHUB_REPOSITORY: 'mheap/test-repo-hyh-stream',
      //GITHUB_EVENT_PATH: __dirname + '/fixtures/pr-opened.json'
    });

    tools = new Toolkit()
    tools.exit.success = jest.fn()
    tools.exit.failure = jest.fn()
  })

  afterEach(() => {
    restore()
    restoreTest()
  })

  it('runs to completion on opened PR', async () => {
    restoreTest = mockedEnv({
      "GITHUB_EVENT_NAME": "pull_request"
    });

    mockStatus("pending", "Giving others the opportunity to review").reply(200);

    tools.log.pending = jest.fn()
    tools.log.complete = jest.fn()

    tools.context.payload = {'action': 'opened'};

    await action(tools)
    expect(tools.log.pending).toHaveBeenCalledWith('Adding pending status check')
    expect(tools.log.complete).toHaveBeenCalledWith('Added pending status check')
    expect(tools.exit.success).toHaveBeenCalledWith('Action finished')
  })

  it('handles errors on opened PR', async () => {
    restoreTest = mockedEnv({
      "GITHUB_EVENT_NAME": "pull_request"
    });

    mockStatus("pending", "Giving others the opportunity to review")
      .reply(422, {
        "message": "No commit found for SHA: 253187c4c33beddeb518eb331e4efaf41b2f4feb",
        "documentation_url": "https://developer.github.com/v3/repos/statuses/#create-a-status"
      });

    tools.log.pending = jest.fn()
    tools.log.complete = jest.fn()

    tools.context.payload = {'action': 'opened'};

    await action(tools)
    expect(tools.log.pending).toHaveBeenCalledWith('Adding pending status check')
    expect(tools.exit.failure).toHaveBeenCalledWith("No commit found for SHA: 253187c4c33beddeb518eb331e4efaf41b2f4feb");
  })

  it('runs on synchronized PR', async () => {
    tools.context.payload = {'action': 'synchronize'};
    await action(tools)
    expect(tools.exit.success).toHaveBeenCalled()
    expect(tools.exit.success).toHaveBeenCalledWith('Action finished')
  })

  it('runs successfully with the default duration', async () => {
    expect(tools.log.info).toHaveBeenCalledWith('Running with duration of PT10M')
  });

  fit('runs successfully with a user specified duration', async () => {
    restoreTest = mockedEnv({
      "GITHUB_EVENT_NAME": "schedule",
      "INPUT_DURATION": "PT3M"
    });

    tools.context.payload = {'schedule': '* * * * *'};

    tools.log.info = jest.fn();

    nock('https://api.github.com').
      get('/repos/mheap/test-repo-hyh-stream/pulls?state=open').
      reply(200, [
        {
          "merge_commit_sha": "253187c4c33beddeb518eb331e4efaf41b2f4feb",
          "head": {
            "sha": "fe4f4ff2f32bc41d04757bfbae347f8be189d091"
          }
        }
      ]);

    nock('https://api.github.com').
      get('/repos/mheap/test-repo-hyh-stream/commits/253187c4c33beddeb518eb331e4efaf41b2f4feb/statuses').
      reply(200, [
        {
          "state": "pending",
          "context": "hold-your-horses",
          "updated_at": "2020-03-07T16:50:47Z",
        }
      ]);

    nock('https://api.github.com').
      post('/repos/mheap/test-repo-hyh-stream/statuses/253187c4c33beddeb518eb331e4efaf41b2f4feb', {
        "state": "success",
        "context": "hold-your-horses",
        "description": "Review time elapsed"
      }).
      reply(200);

    nock('https://api.github.com').
      post('/repos/mheap/test-repo-hyh-stream/statuses/fe4f4ff2f32bc41d04757bfbae347f8be189d091', {
        "state": "success",
        "context": "hold-your-horses",
        "description": "Review time elapsed"
      }).
      reply(200);

    await action(tools)
    expect(tools.log.info).toHaveBeenCalledWith('Running with duration of PT3M')
    expect(tools.exit.success).toHaveBeenCalledWith('Action finished')
  })
})

function mockStatus(state, description) {
  nock('https://api.github.com')
    .post('/repos/mheap/test-repo-hyh-stream/statuses/253187c4c33beddeb518eb331e4efaf41b2f4feb', { state, context: "hold-your-horses", description})

}

