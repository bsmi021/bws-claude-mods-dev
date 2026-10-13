---
name: staging-deploy-region
description: Relevant when deploying to staging or changing deploy configuration or scripts for this project.
metadata:
  type: project
---

The staging deploy requires the REGION flag set to eu-west-1.
Why: the user stated this constraint for the staging environment.
How to apply: include REGION=eu-west-1 whenever running or configuring the staging deploy.
