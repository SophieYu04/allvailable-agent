import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';

class DayRoller extends StatefulWidget {
  const DayRoller(
      {super.key,
      required this.date,
      required this.onChanged,
      required this.builder,
      this.leadingWidth = 0});
  final DateTime date;
  final double leadingWidth;
  final ValueChanged<DateTime> onChanged;
  final Widget Function(List<DateTime> days) builder;
  @override
  State<DayRoller> createState() => _DayRollerState();
}

class _DayRollerState extends State<DayRoller> {
  static const centre = 10;
  ScrollController? _scroll;
  late DateTime _origin = widget.date;
  late DateTime _selected = widget.date;
  double _extent = 0;
  bool _recentering = false;
  DateTime _dateAt(int offset) =>
      DateTime(_origin.year, _origin.month, _origin.day + offset);
  @override
  void didUpdateWidget(DayRoller oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.date != _selected) {
      _selected = widget.date;
      _origin = widget.date;
      WidgetsBinding.instance.addPostFrameCallback((_) => _reset());
    }
  }

  void _reset() {
    if (!mounted || _scroll?.hasClients != true) return;
    _recentering = true;
    _scroll!.jumpTo(widget.leadingWidth + centre * _extent);
    _recentering = false;
  }

  bool _notification(ScrollNotification notification) {
    if (notification.metrics.axis != Axis.horizontal || _recentering)
      return false;
    if (notification is ScrollUpdateNotification) {
      final date = _dateAt(
          ((notification.metrics.pixels - widget.leadingWidth) / _extent)
                  .round() -
              centre);
      if (date != _selected) {
        _selected = date;
        HapticFeedback.selectionClick();
        widget.onChanged(date);
      }
    }
    if (notification is ScrollEndNotification) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        setState(() => _origin = _selected);
        _reset();
      });
    }
    return false;
  }

  @override
  void dispose() {
    _scroll?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      LayoutBuilder(builder: (context, constraints) {
        final extent = constraints.maxWidth / 5;
        _scroll ??= ScrollController(
            initialScrollOffset: widget.leadingWidth + centre * extent);
        if (_extent != 0 && extent != _extent)
          WidgetsBinding.instance.addPostFrameCallback((_) => _reset());
        _extent = extent;
        return NotificationListener<ScrollNotification>(
            onNotification: _notification,
            child: SingleChildScrollView(
              key: const ValueKey('day-roller'),
              controller: _scroll,
              scrollDirection: Axis.horizontal,
              physics: DaySnapPhysics(
                  dayExtent: extent, origin: widget.leadingWidth),
              child: SizedBox(
                  width: widget.leadingWidth + extent * 25,
                  height: constraints.maxHeight,
                  child: widget.builder(
                      List.generate(25, (index) => _dateAt(index - centre)))),
            ));
      });
}

class DaySnapPhysics extends ScrollPhysics {
  const DaySnapPhysics(
      {required this.dayExtent, this.origin = 0, super.parent});
  final double dayExtent;
  final double origin;
  @override
  DaySnapPhysics applyTo(ScrollPhysics? ancestor) => DaySnapPhysics(
      dayExtent: dayExtent, origin: origin, parent: buildParent(ancestor));
  @override
  Simulation? createBallisticSimulation(
      ScrollMetrics position, double velocity) {
    if ((velocity <= 0 && position.pixels <= position.minScrollExtent) ||
        (velocity >= 0 && position.pixels >= position.maxScrollExtent))
      return super.createBallisticSimulation(position, velocity);
    final tolerance = toleranceFor(position);
    var day = (position.pixels - origin) / dayExtent;
    if (velocity > tolerance.velocity) day += .5;
    if (velocity < -tolerance.velocity) day -= .5;
    final target = (origin + day.round() * dayExtent)
        .clamp(origin, position.maxScrollExtent);
    if ((target - position.pixels).abs() < .01) return null;
    return ScrollSpringSimulation(spring, position.pixels, target, velocity,
        tolerance: tolerance);
  }

  @override
  bool get allowImplicitScrolling => false;
}
