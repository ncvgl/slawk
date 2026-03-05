  1. spawn a QA subagent that uses the frontend like a real user thanks to the browser MCP tool
  2. the task is to find a single bug and report it back.
  3. spawn a new agent to fix the bug. then it should write a playwright test that passes. then it should check all tests pass. then it should commit and push. then it reports back.
  4. repeat this loop until you can not find any more bugs
  5. then look into @analysis.md for other ideas of bugs

  The spawning is important to prevent your context from getting bloated thanks to delegating tasks to subagents.
  You should set the subagents to Sonnet or even haiku model if you think the task is medium or easy - this will go faster.
  If something is taking longer than 10 minutes to do, you can skip it and move on. Quantity of bugs fixed is the key metric.
  Ask me now if you have any questions because I am going to sleep for 8 hours.
