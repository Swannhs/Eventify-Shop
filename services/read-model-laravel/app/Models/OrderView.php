<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OrderView extends Model
{
    public $timestamps = false;

    protected $table = 'orders_view';

    protected $primaryKey = 'order_id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'order_id',
        'status',
        'total',
        'created_at',
        'updated_at',
    ];

    protected $casts = [
        'total' => 'float',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];
}
