# Fetch
trying to automate scraping using LLMs

My idea:

- Use a multi-agent system with an orchestrator, image reviewer, code reviewer.
- The system will receive a JSON input which contains the URL, a description of the data we need to extract, any constraints (e.g - you can't lookup date ranges > 1 month)
- Can also specify data output (optional)
- Agents will communicate with each other to figure out where the data is contained
  
Motivation
- Atlas, Comet are great freemium tools, but I think it should be fully free (or the user can just provide their LLM API key and pay for that).

Update:

- look at PLaywright MCP which provides tools that agents can use to explore browsers
- Vercel Agent Browser CLI just launched on top of playwright but I prefer using python

  1. Build a simple streaming service where I can see the LLM run commands which I will provide.
