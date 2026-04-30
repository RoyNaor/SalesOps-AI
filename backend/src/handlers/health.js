"use strict";

const service = process.env.SERVICE_NAME || "salesops-ai";
const stage = process.env.STAGE_NAME || "dev";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS"
};

exports.handler = async () => ({
  statusCode: 200,
  headers: {
    "Content-Type": "application/json",
    ...corsHeaders
  },
  body: JSON.stringify({
    status: "ok",
    service,
    stage,
    timestamp: new Date().toISOString()
  })
});
