package com.yuema.mobile

import android.content.ContentResolver
import android.provider.CalendarContract

/** CalendarContract counterpart to the iOS EventKit adapter. */
class CalendarContractAdapter(private val resolver: ContentResolver) {
    fun busy(startMillis: Long, endMillis: Long): List<Map<String, Any>> {
        val projection = arrayOf(CalendarContract.Instances.EVENT_ID, CalendarContract.Instances.BEGIN, CalendarContract.Instances.END, CalendarContract.Instances.AVAILABILITY)
        val uri = CalendarContract.Instances.CONTENT_URI.buildUpon().appendPath(startMillis.toString()).appendPath(endMillis.toString()).build()
        val result = mutableListOf<Map<String, Any>>()
        resolver.query(uri, projection, null, null, null)?.use { cursor ->
            val eventId = cursor.getColumnIndexOrThrow(CalendarContract.Instances.EVENT_ID)
            val begin = cursor.getColumnIndexOrThrow(CalendarContract.Instances.BEGIN)
            val finish = cursor.getColumnIndexOrThrow(CalendarContract.Instances.END)
            val availability = cursor.getColumnIndexOrThrow(CalendarContract.Instances.AVAILABILITY)
            while (cursor.moveToNext()) {
                if (cursor.getInt(availability) != CalendarContract.Instances.AVAILABILITY_FREE) {
                    result += mapOf("id" to cursor.getString(eventId), "startAt" to cursor.getLong(begin), "endAt" to cursor.getLong(finish), "tentative" to false)
                }
            }
        }
        return result
    }
}
