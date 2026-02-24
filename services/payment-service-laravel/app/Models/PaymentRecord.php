<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PaymentRecord extends Model
{
    public $timestamps = false;

    protected $table = 'payment_records';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'source_event_id',
        'order_id',
        'correlation_id',
        'status',
        'input_payload',
        'created_at',
    ];

    protected $casts = [
        'input_payload' => 'array',
        'created_at' => 'datetime',
    ];
}
