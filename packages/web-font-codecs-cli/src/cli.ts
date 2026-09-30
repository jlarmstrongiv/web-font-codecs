#!/usr/bin/env node
import { main, reportError } from './index.ts';
await main().catch(reportError);
