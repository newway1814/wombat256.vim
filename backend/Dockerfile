FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app
COPY scripts ./scripts
COPY data ./data
COPY wsgi.py .

RUN useradd --create-home fab
USER fab
EXPOSE 5000

# Fill the database on first start, then serve. Threads keep long streaming chats from
# blocking other requests.
# PORT is set by hosts such as Render; 5000 otherwise. One worker keeps the chat rate limit in
# one place; threads serve concurrent requests.
CMD ["sh", "-c", "python -m scripts.bootstrap && exec gunicorn -b 0.0.0.0:${PORT:-5000} -w 1 -k gthread --threads 16 --timeout 600 wsgi:app"]
