<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ShipmentView extends Model
{
    public $timestamps = false;

    protected $table = 'shipments_view';

    protected $primaryKey = 'shipment_id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'shipment_id',
        'order_id',
        'carrier',
        'status',
        'created_at',
    ];

    protected $casts = [
        'created_at' => 'datetime',
    ];
}
