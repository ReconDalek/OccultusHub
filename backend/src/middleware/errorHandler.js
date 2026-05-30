// Format error responses for Workers
export function errorHandler(error) {
  console.error('Error:', error);

  let status = 500;
  let message = 'Internal server error';

  if (error.message === 'Unauthorized') {
    status = 401;
    message = 'Invalid or expired token';
  } else if (error.message === 'Forbidden') {
    status = 403;
    message = 'Admin access required';
  } else if (error.message === 'Not Found') {
    status = 404;
    message = 'Resource not found';
  } else if (error.message === 'Bad Request') {
    status = 400;
    message = 'Invalid request';
  } else if (error.message) {
    message = error.message;
  }

  return new Response(
    JSON.stringify({ error: message, status }),
    { status, headers: { 'Content-Type': 'application/json' } }
  );
}

// Successful JSON response
export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Error JSON response
export function errorResponse(message, status = 400) {
  return new Response(JSON.stringify({ error: message, status }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
