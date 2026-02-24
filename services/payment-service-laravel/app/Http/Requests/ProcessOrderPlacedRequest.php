<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ProcessOrderPlacedRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'eventId' => ['required', 'uuid'],
            'eventType' => ['required', 'string', 'in:OrderPlaced'],
            'occurredAt' => ['required', 'date'],
            'correlationId' => ['required', 'uuid'],
            'producer' => ['required', 'string'],
            'version' => ['required', 'integer', 'min:1'],
            'payload' => ['required', 'array'],
            'payload.orderId' => ['required', 'uuid'],
            'payload.items' => ['required', 'array', 'min:1'],
            'payload.items.*.sku' => ['required', 'string'],
            'payload.items.*.quantity' => ['required', 'integer', 'min:1'],
            'payload.forcePaymentFailed' => ['sometimes', 'boolean'],
            'payload.forcePaymentFailure' => ['sometimes', 'boolean'],
            'payload.forceException' => ['sometimes', 'boolean'],
            'payload.total' => ['sometimes', 'numeric'],
        ];
    }
}
