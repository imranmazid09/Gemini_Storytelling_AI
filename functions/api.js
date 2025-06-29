// --- Netlify Serverless Function for Secure API Calls ---

// This function acts as a secure proxy to the Google AI APIs.
// It fetches the secret API keys from Netlify's environment variables
// and forwards the user's request to the appropriate API endpoint.

exports.handler = async (event) => {
  // --- Environment Variables ---
  // These are set in the Netlify UI, not in the code.
  const { GEMINI_API_KEY, IMAGEN_API_KEY } = process.env;

  // --- Determine which API to call based on the request path ---
  const isImagenRequest = event.path.includes('/api/imagen');
  const isGeminiRequest = event.path.includes('/api/gemini');

  // --- Security and Input Validation ---
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405, // Method Not Allowed
      body: JSON.stringify({ error: 'Only POST requests are allowed.' }),
    };
  }

  let requestBody;
  try {
    requestBody = JSON.parse(event.body);
  } catch (error) {
    return {
      statusCode: 400, // Bad Request
      body: JSON.stringify({ error: 'Invalid JSON in request body.' }),
    };
  }

  // --- Select API Key and URL based on request type ---
  let apiKey;
  let apiUrl;

  if (isGeminiRequest) {
    apiKey = GEMINI_API_KEY;
    apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  } else if (isImagenRequest) {
    apiKey = IMAGEN_API_KEY;
    apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;
  } else {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid API endpoint specified.' }),
    };
  }

  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'API key is not configured on the server.' }),
    };
  }
  
  // --- API Call Logic ---
  try {
    const fetch = (await import('node-fetch')).default;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody), // Forward the body from the client
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error('Upstream API Error:', errorBody);
        return {
            statusCode: response.status,
            body: JSON.stringify({ error: `Failed to fetch from Google AI API. Status: ${response.status}`, details: errorBody }),
        };
    }

    const data = await response.json();

    // --- Return Response to Client ---
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    };

  } catch (error) {
    console.error('Error in serverless function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'An internal server error occurred.' }),
    };
  }
};
