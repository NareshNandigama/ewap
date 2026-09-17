
## Description

Engineering workflow automation platform that reacts to GitHub/CI events, executes reliable asynchronous workflows, and uses AI selectively for reasoning. 

                    EWAP
                     │
          ┌──────────┴──────────┐
          │                     │
       Platform              AI Layer
          │                     │
     Auth / RBAC            LLM Providers ✅
     PostgreSQL             Streaming ✅
     Redis                  Grounding ✅
     RabbitMQ
     WebSockets
          │
          ▼
       AI v1
          │
    Conversation
    Persistence
    History
          │
          ▼
       AI v2
          │
     ┌────┼─────────────┐
     │    │             │
   Tools  RAG       Structured
     │    │           Output
     │    │
     │  Embeddings
     │    │
     │  pgvector
     │    │
     └────┴──────┐
                 ▼
             LangChain
                 │
                 ▼
             LangGraph
                 │
                 ▼
          Agentic Workflows
                 │
        ┌────────┼────────┐
        ▼        ▼        ▼
   Investigator Critic Validator
        │
        ▼
     AI Evaluation
        │
        ▼
  Observability /
  Security /
  Guardrails
