# Fetch
trying to automate scraping using LLMs

My idea:

- Use a multi-agent system with an orchestrator, image reviewer, code reviewer.
- The system will receive a JSON input which contains the URL, a description of the data we need to extract, any constraints (e.g - you can't lookup date ranges > 1 month)
- Can also specify data output (optional)
- Agents will communicate with each other to figure out where the data is contained, and then parse using bs4
  
Motivation
- Atlas, Comet are great freemium tools, but I think it should be free.

References:
- I read this paper and it had very similar ideas: https://arxiv.org/abs/2503.02950
