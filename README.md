# EWAP — Engineering Workflow Automation Platform

EWAP is a full-stack platform for creating, executing, and monitoring
engineering workflows.

It organizes automation around a simple hierarchy:

Organization → Project → Workflow → Workflow Run

Projects group related engineering workflows, while each workflow can have
multiple execution runs with independent status and history.

EWAP also includes an AI assistant that can use workflow-run data to help
analyze execution status and failures.

## Features

- Organization-based project management
- Workflow creation and management
- Workflow execution history
- Workflow run status tracking
- JWT authentication
- Role-based authorization with ADMIN and MEMBER roles
- Guest access for the public demo
- Real-time workflow status architecture using WebSockets
- RabbitMQ-based asynchronous workflow execution architecture
- Streaming AI responses
- Workflow-run-aware AI diagnostics
- AI conversation persistence
- Dockerized backend
- Cloud deployment using AWS and Vercel

## Architecture

EWAP is split into a Next.js frontend, NestJS backend, PostgreSQL database,
messaging layer, real-time communication layer, and AI integration.

                        ┌─────────────────────┐
                        │      Next.js        │
                        │   React Frontend    │
                        └─────────┬───────────┘
                                  │
                              REST / HTTP
                                  │
                        ┌─────────▼───────────┐
                        │      NestJS         │
                        │        API          │
                        └─────────┬───────────┘
                                  │
                 ┌────────────────┼────────────────┐
                 │                │                │
                 ▼                ▼                ▼
          ┌────────────┐   ┌────────────┐   ┌────────────┐
          │ PostgreSQL │   │  RabbitMQ  │   │ AI Service │
          │   Prisma   │   │ Messaging  │   │ LLM        │
          └────────────┘   └──────┬─────┘   └────────────┘
                                  │
                                  ▼
                           ┌─────────────┐
                           │  Workflow   │
                           │   Worker    │
                           └──────┬──────┘
                                  │
                                  ▼
                           WebSocket Events
                                  │
                                  ▼
                            React Frontend


## Core Domain Model

Organization
    │
    ├── Users
    │
    └── Projects
          │
          └── Workflows
                │
                └── Workflow Runs


### Project

A project represents an engineering system or automation domain.

Example:

Release Automation Platform


### Workflow

A workflow represents a repeatable engineering operation.

Examples:

- Build & Test Pipeline
- Security & Dependency Scan
- Database Migration Pipeline
- Production Deployment Pipeline
- Post-Deployment Health Check
- Rollback Deployment


### Workflow Run

Every workflow execution creates a separate Workflow Run.

A run can move through statuses such as:

PENDING → RUNNING → SUCCESS

or

PENDING → RUNNING → FAILED

This allows EWAP to maintain execution history independently from the
workflow definition.


## Workflow Execution

EWAP is designed around asynchronous workflow execution.

Client
  │
  │ POST /workflows/:id/runs
  ▼
NestJS API
  │
  ├── Create WorkflowRun (PENDING)
  │
  ▼
RabbitMQ
  │
  ▼
Workflow Worker
  │
  ├── RUNNING
  │
  ├── Execute workflow
  │
  └── SUCCESS / FAILED
  │
  ▼
WebSocket Event
  │
  ▼
Frontend receives status update


The public production demo currently runs with messaging disabled, so newly
created workflow runs are persisted as PENDING rather than dispatched to a
background worker.


## AI Assistant

EWAP includes an AI assistant for workflow diagnostics.

The assistant can receive workflow-run context from the backend before
generating a response.

User Question
      │
      ▼
AI API
      │
      ├── Load WorkflowRun
      │
      ├── Build grounded context
      │
      ▼
LLM Provider
      │
      ▼
Streaming Response
      │
      ▼
Frontend


AI conversations and messages are persisted so conversations can be
continued across requests.

EWAP uses an LLM provider abstraction so application logic is not directly
coupled to a single AI provider.

> EWAP v1 uses application-data grounding. It does not currently use a
> vector database or RAG pipeline.


## Authentication & Authorization

EWAP uses JWT-based authentication.

After login, the backend generates an access token containing the user's
identity, organization, and role.

Protected API requests include the token using:

Authorization: Bearer <token>

Two roles are currently supported:

- ADMIN
- MEMBER

Authorization is enforced by the backend.

The public demo also provides Guest access using a dedicated MEMBER account
and a normal JWT.


## Tech Stack

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- Socket.IO Client

### Backend

- NestJS
- TypeScript
- Prisma ORM
- PostgreSQL
- RabbitMQ
- Socket.IO
- JWT
- bcrypt

### AI

- LLM provider abstraction
- Gemini provider
- OpenAI provider
- Streaming responses
- Workflow-run grounding
- Conversation persistence

### Infrastructure

- Docker
- AWS ECS / Fargate
- AWS ECR
- AWS RDS PostgreSQL
- Vercel


## Production Architecture

                    Internet
                       │
                       ▼
                 ┌───────────┐
                 │  Vercel   │
                 │  Next.js  │
                 └─────┬─────┘
                       │
                       ▼
                ┌─────────────┐
                │ AWS ECS     │
                │ NestJS API  │
                └──────┬──────┘
                       │
                       ▼
                ┌─────────────┐
                │ AWS RDS     │
                │ PostgreSQL  │
                └─────────────┘


The frontend is hosted on Vercel.

The NestJS API runs as a Docker container on AWS ECS/Fargate. Docker images
are stored in AWS ECR, and application data is stored in PostgreSQL on AWS
RDS.


## Repository Structure

ewap/
├── api/        # NestJS backend
├── web/        # Next.js frontend
└── README.md


## Running Locally

### Prerequisites

- Node.js
- Yarn
- PostgreSQL
- RabbitMQ
- Docker

Clone the repository and install the frontend and backend dependencies.

Environment-specific configuration such as database credentials, JWT
configuration, messaging configuration, frontend URL, and AI provider
credentials should be supplied through environment variables.

[Exact local setup commands should match the repository configuration.]


## Current Scope

EWAP currently focuses on:

- Projects
- Workflows
- Workflow Runs
- Authentication and authorization
- Asynchronous workflow architecture
- Real-time status updates
- AI-assisted workflow diagnostics
- Conversation persistence
- Production deployment

Future iterations can extend the platform with areas such as retry/DLQ
processing, transactional outbox, observability, RAG, AI evaluation, and
more granular authorization.


## Author

Naresh Nandigama