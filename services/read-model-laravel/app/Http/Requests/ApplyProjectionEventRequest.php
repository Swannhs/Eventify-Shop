<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ApplyProjectionEventRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'eventId' => ['required', 'uuid'],
            'eventType' => ['required', 'string'],
            'occurredAt' => ['required', 'date'],
            'correlationId' => ['required', 'uuid'],
            'producer' => ['required', 'string'],
            'version' => ['required', 'integer', 'min:1'],
            'payload' => ['required', 'array'],
            'payload.orderId' => ['required', 'uuid'],
            'payload.shipmentId' => ['nullable', 'uuid'],
            'payload.status' => ['nullable', 'string'],
            'payload.carrier' => ['nullable', 'string'],
            'payload.total' => ['nullable', 'numeric'],
            'payload.items' => ['nullable', 'array'],
            'payload.items.*.quantity' => ['nullable', 'integer', 'min:1'],
        ];
    }
}
