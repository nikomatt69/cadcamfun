%
G21 G90 G17 G94 G40 G49 G80
G54
(OPERATION: probe)
T1 M6
G43 H1
G0 X0.000 Y0.000 Z30.000
G38.3 X30.000 Y30.000 F2000
o100 if [#5070 eq 1]
(abort, 992 THE PROBE TOUCHED DURING A PROTECTED MOVE)
o100 endif
G38.3 X30.000 Y30.000 Z-7.000 F2000
o101 if [#5070 eq 1]
(abort, 992 THE PROBE TOUCHED DURING A PROTECTED MOVE)
o101 endif
G91
G38.2 X14.000 F500
G90
#<prapfx>=#5061
G1 X[#<prapfx>-1] Y30.000 Z-7.000 F2000
G91
G38.2 X7.000 F100
G90
#<prapx>=#5061
G1 X30.000 Y30.000 Z-7.000 F2000
G91
G38.2 X-14.000 F500
G90
#<pramfx>=#5061
G1 X[#<pramfx>-[-1]] Y30.000 Z-7.000 F2000
G91
G38.2 X-7.000 F100
G90
#<pramx>=#5061
G1 X30.000 Y30.000 Z-7.000 F2000
#<prmx>=[[#<prapx>+#<pramx>]*0.5]
G38.3 X#<prmx> Y30.000 F2000
o102 if [#5070 eq 1]
(abort, 992 THE PROBE TOUCHED DURING A PROTECTED MOVE)
o102 endif
G91
G38.2 Y14.000 F500
G90
#<prbpfy>=#5062
G1 X#<prmx> Y[#<prbpfy>-1] Z-7.000 F2000
G91
G38.2 Y7.000 F100
G90
#<prbpy>=#5062
G1 X#<prmx> Y30.000 Z-7.000 F2000
G91
G38.2 Y-14.000 F500
G90
#<prbmfy>=#5062
G1 X#<prmx> Y[#<prbmfy>-[-1]] Z-7.000 F2000
G91
G38.2 Y-7.000 F100
G90
#<prbmy>=#5062
G1 X#<prmx> Y30.000 Z-7.000 F2000
#<prmy>=[[#<prbpy>+#<prbmy>]*0.5]
G38.3 X#<prmx> Y#<prmy> F2000
o103 if [#5070 eq 1]
(abort, 992 THE PROBE TOUCHED DURING A PROTECTED MOVE)
o103 endif
G91
G38.2 X14.000 F500
G90
#<prcpfx>=#5061
G1 X[#<prcpfx>-1] Y#<prmy> Z-7.000 F2000
G91
G38.2 X7.000 F100
G90
#<prcpx>=#5061
G1 X#<prmx> Y#<prmy> Z-7.000 F2000
G91
G38.2 X-14.000 F500
G90
#<prcmfx>=#5061
G1 X[#<prcmfx>-[-1]] Y#<prmy> Z-7.000 F2000
G91
G38.2 X-7.000 F100
G90
#<prcmx>=#5061
G1 X#<prmx> Y#<prmy> Z-7.000 F2000
#<prx>=[[#<prcpx>+#<prcmx>]*0.5]
#<pry>=#<prmy>
#<prdiameterX>=[[#<prcpx>-#<prcmx>]+[2*2]]
#<prdiameterY>=[[#<prbpy>-#<prbmy>]+[2*2]]
#<prdiameter>=[[#<prdiameterX>+#<prdiameterY>]*0.5]
G38.3 X#<prmx> Y#<prmy> Z30.000 F2000
o104 if [#5070 eq 1]
(abort, 992 THE PROBE TOUCHED DURING A PROTECTED MOVE)
o104 endif
#<pro0lX>=[#<prx>-30]
#<pro0lY>=[#<pry>-30]
#<pro0lm>=sqrt[[[#<pro0lX>*#<pro0lX>]+[#<pro0lY>*#<pro0lY>]]]
G10 L2 P1 X[#5221+#<pro0lX>]
G10 L2 P1 Y[#5222+#<pro0lY>]
o105 if [abs[[#<prdiameter>-20]] gt 0.05]
(abort, 820 DIAMETER OUT OF TOLERANCE)
o105 endif
#<prt0>=#<prx>
(LOG,PROBE x=#<prt0>)
#<prt1>=#<pry>
(LOG,PROBE y=#<prt1>)
#<prt2>=#<prdiameter>
(LOG,PROBE diameter=#<prt2>)
M5
M2
%
