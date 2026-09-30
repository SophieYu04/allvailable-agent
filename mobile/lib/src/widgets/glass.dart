import 'dart:ui';

import 'package:flutter/material.dart';

class GlassPanel extends StatelessWidget {
  const GlassPanel({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.borderRadius = 20,
    this.tint,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double borderRadius;
  final Color? tint;

  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(borderRadius),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
          child: Container(
            padding: padding,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  tint ?? const Color(0xFF19302E).withValues(alpha: 0.72),
                  const Color(0xFF101B22).withValues(alpha: 0.82),
                ],
              ),
              borderRadius: BorderRadius.circular(borderRadius),
              border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
              boxShadow: [
                BoxShadow(
                    color: const Color(0xFF050B10).withValues(alpha: 0.3),
                    blurRadius: 20,
                    offset: const Offset(0, 10))
              ],
            ),
            child: child,
          ),
        ),
      );
}

class GlassEventCard extends StatelessWidget {
  const GlassEventCard(
      {super.key, required this.event, required this.height, this.onTap});

  final CalendarEventView event;
  final double height;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final color = switch (event.color) {
      EventColorView.sage => const Color(0xFF9CC7A5),
      EventColorView.blue => const Color(0xFF9CB9D9),
      EventColorView.peach => const Color(0xFFE7B18D),
      EventColorView.lilac => const Color(0xFFC5B1D8),
    };
    return Semantics(
        button: true,
        label: event.title,
        child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 3),
            child: Material(
                color: Colors.transparent,
                borderRadius: BorderRadius.circular(10),
                child: InkWell(
                    onTap: onTap,
                    borderRadius: BorderRadius.circular(10),
                    child: Ink(
                        height: height,
                        padding: const EdgeInsets.fromLTRB(7, 5, 6, 5),
                        decoration: BoxDecoration(
                            color: color.withValues(
                                alpha: event.isExternal ? 0.24 : 0.52),
                            borderRadius: BorderRadius.circular(10),
                            border: Border(
                                left: BorderSide(color: color, width: 3),
                                top: BorderSide(
                                    color: color.withValues(alpha: 0.28)),
                                right: BorderSide(
                                    color: color.withValues(alpha: 0.2)),
                                bottom: BorderSide(
                                    color: color.withValues(alpha: 0.2)))),
                        child: height < 44
                            ? Text(event.title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontSize: 10, fontWeight: FontWeight.w700))
                            : Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                    Text(event.timeLabel,
                                        maxLines: 1,
                                        overflow: TextOverflow.clip,
                                        style: TextStyle(
                                            fontSize: 9,
                                            color: Colors.white
                                                .withValues(alpha: 0.72))),
                                    const SizedBox(height: 2),
                                    Text(event.title,
                                        maxLines: 2,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                            fontSize: 10,
                                            fontWeight: FontWeight.w700)),
                                  ]))))));
  }
}

class CalendarBackdrop extends StatelessWidget {
  const CalendarBackdrop({super.key});

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF0A1218), Color(0xFF102220), Color(0xFF0D171D)],
            stops: [0, 0.58, 1],
          ),
        ),
        child: Stack(
          children: [
            Positioned(
              top: -105,
              right: -105,
              child: _Glow(size: 270, color: Color(0xFF58A67A)),
            ),
          ],
        ),
      );
}

class _Glow extends StatelessWidget {
  const _Glow({required this.size, required this.color});

  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) => ImageFiltered(
        imageFilter: ImageFilter.blur(sigmaX: 74, sigmaY: 74),
        child: Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
              shape: BoxShape.circle, color: color.withValues(alpha: 0.16)),
        ),
      );
}

enum EventColorView { sage, blue, peach, lilac }

class CalendarEventView {
  const CalendarEventView(
      {required this.title,
      required this.timeLabel,
      required this.color,
      required this.isExternal});
  final String title;
  final String timeLabel;
  final EventColorView color;
  final bool isExternal;
}
