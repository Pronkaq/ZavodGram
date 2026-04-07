export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class AuthError extends AppError {
  constructor(message = 'Не авторизован') {
    super(401, message, 'AUTH_ERROR');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Нет доступа') {
    super(403, message, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Ресурс') {
    super(404, `${resource} не найден`, 'NOT_FOUND');
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Ошибка валидации') {
    super(400, message, 'VALIDATION_ERROR');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Конфликт данных') {
    super(409, message, 'CONFLICT');
  }
}

export class RateLimitError extends AppError {
  constructor() {
    super(429, 'Слишком много запросов', 'RATE_LIMIT');
  }
}
