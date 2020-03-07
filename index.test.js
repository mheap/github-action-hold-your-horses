const { Toolkit } = require('actions-toolkit')

describe('Hold Your Horses', () => {
  let action, tools

  // Mock Toolkit.run to define `action` so we can call it
  Toolkit.run = jest.fn((actionFn) => { action = actionFn })
  // Load up our entrypoint file
  require('.')

  beforeEach(() => {
    // Create a new Toolkit instance
    tools = new Toolkit()
    // Mock methods on it!
    tools.exit.success = jest.fn()

    process.env.GITHUB_REPOSITORY = 'mheap/test-repo-hyh-stream';
  })

  it('exits successfully', async () => {
    await action(tools)
    expect(tools.exit.success).toHaveBeenCalled()
    expect(tools.exit.success).toHaveBeenCalledWith('Action finished')
  })
})
