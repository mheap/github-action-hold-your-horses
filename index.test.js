const { Toolkit } = require('actions-toolkit')
const mockedEnv = require('mocked-env')
const nock = require('nock')
nock.disableNetConnect()

describe('Hold Your Horses', () => {
  let action, tools, restore

  // Mock Toolkit.run to define `action` so we can call it
  Toolkit.run = jest.fn((actionFn) => { action = actionFn })
  // Load up our entrypoint file
  require('.')

  beforeEach(() => {
    restore = mockedEnv({
      // Global for all tests
      GITHUB_WORKFLOW: 'Hold Your Horses',
      GITHUB_ACTION: 'Hold Your Horses Action',
      GITHUB_ACTOR: 'mheap',
      GITHUB_WORKSPACE: '/tmp',
      GITHUB_SHA: '253187c4c33beddeb518eb331e4efaf41b2f4feb',
      GITHUB_REPOSITORY: 'mheap/test-repo-hyh-stream',

      // Specific per test
      GITHUB_EVENT_NAME: 'pull_request',
      //GITHUB_EVENT_PATH: __dirname + '/fixtures/pr-opened.json'
    });

    console.log(process.env.GITHUB_EVENT);
    tools = new Toolkit()
    tools.exit.success = jest.fn()
    tools.exit.failure = jest.fn()
  })

  afterEach(() => restore())

  it('runs to completion on opened PR', async () => {
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

  fit('runs successfully with a user specified duration', async () => {
    await action(tools)
    expect(tools.exit.success).toHaveBeenCalled()
    expect(tools.exit.success).toHaveBeenCalledWith('Action finished')
  })
})

function mockStatus(state, description) {
  nock('https://api.github.com')
    .post('/repos/mheap/test-repo-hyh-stream/statuses/253187c4c33beddeb518eb331e4efaf41b2f4feb', { state, context: "hold-your-horses", description})

}

